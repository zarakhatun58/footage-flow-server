
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { generateVideo } from '../utils/generateVideo.js';
import Media from '../models/Media.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js';
import { generateVideoToS3, uploadFileToS3 } from '../utils/uploadToS3.js';
import { generateThumbnail } from '../utils/generateThumbnail.js';
import { getSignedUrlFromS3 } from '../utils/s3Client.js';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const generateApiVideo = async (req, res) => {
  try {
    const { imageNames = [], audioName, mediaId, title } = req.body;

    if (!imageNames.length || !mediaId) {
      return res.status(400).json({
        success: false,
        error: "Missing images or mediaId",
      });
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    const audioDir = path.join(uploadsDir, "audio");
    await fs.mkdir(audioDir, { recursive: true });

    // Resolve image paths (must exist locally)
    const imagePaths = imageNames.map((name) =>
      path.join(uploadsDir, path.basename(name))
    );

    // Fetch media record
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ success: false, error: "Media not found" });
    }

    // Determine audio source (local path OR remote URL)
    let audioPath;
    if (audioName) {
      // Local uploaded audio
      audioPath = path.join(audioDir, path.basename(audioName));
    } else if (media.voiceUrl) {
      // If it's already a full URL, keep it as URL; if relative, treat as local
      audioPath = /^https?:\/\//.test(media.voiceUrl)
        ? media.voiceUrl
        : path.join(audioDir, path.basename(media.voiceUrl));
    } else {
      // No audio exists — generate TTS locally
      audioPath = path.join(audioDir, `tts-${mediaId}.mp3`);
      await generateVoiceOver(
        media.story || media.description || "Hello world",
        audioPath
      );
      media.voiceUrl = `/uploads/audio/${path.basename(audioPath)}`;
      await media.save();
    }

    // Upload video directly to S3
    const s3Bucket = process.env.AWS_BUCKET_NAME;
    const s3VideoKey = `videos/video-${uuidv4()}.mp4`;

    const { fileUrl, localPath: localVideoPath } = await generateVideoToS3({
      imagePaths,
      audioPath,
      s3Bucket,
      s3Key: s3VideoKey,
      perImageDuration: 2,
      targetWidth: 1280,
      title: title || media.title,
      emotion: "",
      story: media.story || "",
      tag: "",
    });

    // Generate thumbnail & upload
    const tempThumbPath = path.join(uploadsDir, `thumb-${uuidv4()}.jpg`);
    await generateThumbnail(localVideoPath, tempThumbPath);
    const s3ThumbKey = `thumbnails/${path.basename(tempThumbPath)}`;
    const thumbnailUrl = await uploadFileToS3(tempThumbPath, s3Bucket, s3ThumbKey);

    // cleanup temp files
    await fs.unlink(tempThumbPath).catch(() => { });
    await fs.unlink(localVideoPath).catch(() => { });

    const videoUrl = fileUrl;
    // Update DB
    // const videoUrl = `https://${s3Bucket}.s3.amazonaws.com/${s3VideoKey}`;
    await Media.findByIdAndUpdate(mediaId, {
      storyUrl: videoUrl,
      thumbnailUrl,
      transcript: media.story || "",
      tags: ["example", "tag"],
      emotions: ["happy"],
      encodingStatus: "completed",
      mediaType: "video",
      updatedAt: new Date(),
    });

    // Send response
    const FRONTEND_URL =
      process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com";

    res.json({
      success: true,
      videoUrl,
      thumbnailUrl,
      shortUrl: `${FRONTEND_URL}/m/${mediaId}`,
      transcript: media.story || "",
      tags: ["example", "tag"],
      emotions: ["happy"],
      title: title || media.title,
    });
  } catch (err) {
    console.error("❌ Video generation failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};



export const saveFinalVideo = async (req, res) => {
  try {
    const { mediaId, videoUrl } = req.body; // accept URL directly

    if (!videoUrl) {
      return res.status(400).json({ error: "Video URL is required" });
    }

    await Media.findByIdAndUpdate(mediaId, {
      storyUrl: videoUrl,
      encodingStatus: "completed",
    });

    res.json({ success: true, url: videoUrl });
  } catch (err) {
    console.error("Error saving video URL:", err);
    res.status(500).json({ error: "Failed to save video URL" });
  }
};

export const checkApiVideoStatus = async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!videoId) {
      return res.status(400).json({ success: false, error: 'Missing video ID' });
    }

    // Find the media in DB
    const media = await Media.findOne({ renderId: videoId });
    if (!media) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    // Get signed URL for playback
    const signedUrl = await getSignedUrlFromS3(videoId);

    res.json({
      success: true,
      playbackUrl: signedUrl,
      metadata: {
        thumbnail: media.thumbnail || null,
        transcript: media.transcript || null,
        tags: media.tags || [],
        emotions: media.emotions || [],
        story: media.story || '',
        storyUrl: media.storyUrl || '',
        encodingStatus: media.encodingStatus || 'processing',
        createdAt: media.createdAt
      }
    });
  } catch (err) {
    console.error('❌ Error in /status route:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};


export const getAllVideos = async (req, res) => {
  try {
    const videos = await Media.find({ mediaType: 'video' })
      .sort({ createdAt: -1 })
      .select('title description storyUrl likes shares views createdAt');

    res.json({ success: true, videos });
  } catch (err) {
    console.error('❌ Error fetching videos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// workable
// export const generateApiVideo = async (req, res) => {
//   try {
//     const { imageNames, audioName, mediaId } = req.body;

//     if (!imageNames?.length || !mediaId) {
//       return res.status(400).json({ success: false, error: "Missing images or mediaId" });
//     }

//     const uploadsDir = path.join(process.cwd(), "uploads");
//     const audioDir = path.join(uploadsDir, "audio");
//     await fs.mkdir(audioDir, { recursive: true });

//     // Resolve image paths and validate
//     const imagePaths = imageNames.map(name => path.join(uploadsDir, path.basename(name)));
//     for (const imgPath of imagePaths) {
//       if (!(await fileExists(imgPath))) {
//         return res.status(404).json({ success: false, error: `Image not found: ${imgPath}` });
//       }
//     }

//     // Fetch media
//     const media = await Media.findById(mediaId);
//     if (!media) return res.status(404).json({ success: false, error: "Media not found" });

//     // Determine audio
//     let audioPath;
//     if (media.voiceUrl) {
//       audioPath = path.join(audioDir, path.basename(media.voiceUrl));
//       if (!(await fileExists(audioPath))) {
//         return res.status(404).json({ success: false, error: "Stored audio not found" });
//       }
//     } else if (audioName) {
//       audioPath = path.join(audioDir, path.basename(audioName));
//       if (!(await fileExists(audioPath))) {
//         return res.status(404).json({ success: false, error: "Provided audio not found" });
//       }
//     } else {
//       // Generate TTS directly into audioDir
//       const ttsFileName = `tts-${mediaId}.mp3`;
//       audioPath = path.join(audioDir, ttsFileName);
//       await generateVoiceOver(media.story || media.description || "Hello world", audioPath);
//       media.voiceUrl = `/uploads/audio/${ttsFileName}`;
//       await media.save();
//     }

//     // Get dynamic video duration from audio length
//     const audioDuration = await getAudioDuration(audioPath);

//     // Generate video
//     const tempOutput = path.join(uploadsDir, `temp-${uuidv4()}.mp4`);
//     await generateVideo(imagePaths, audioPath, tempOutput, audioDuration);

//     // Generate thumbnail
//     const localThumbPath = path.join(uploadsDir, `thumb-${uuidv4()}.jpg`);
//     await generateThumbnail(tempOutput, localThumbPath);

//     // Upload video & thumbnail to S3
//     const videoUrl = await uploadFileToS3(tempOutput, `videos/${path.basename(tempOutput)}`);
//     const thumbUrl = await uploadFileToS3(localThumbPath, `thumbnails/${path.basename(localThumbPath)}`);

//     // Save to DB
//     const FRONTEND_URL = process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com";
//     await Media.findByIdAndUpdate(mediaId, {
//       storyUrl: videoUrl,
//       thumbnailUrl: thumbUrl,
//       transcript: "",
//       tags: [],
//       emotions: [],
//       encodingStatus: "completed",
//       mediaType: "video",
//       shares: 1,
//       createdAt: new Date(),
//     });

//     // Cleanup temp files
//     await Promise.all([
//       fs.unlink(tempOutput).catch(() => {}),
//       fs.unlink(localThumbPath).catch(() => {}),
//     ]);

//     res.json({
//       success: true,
//       videoUrl,
//       thumbnailUrl: thumbUrl,
//       shortUrl: `${FRONTEND_URL}/m/${mediaId}`,
//     });
//   } catch (err) {
//     console.error("❌ Video generation failed:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const generateApiVideo = async (req, res) => {

//   try {
//     const { imageNames, audioName, mediaId } = req.body;

//     if (!imageNames || !Array.isArray(imageNames) || imageNames.length === 0 || !mediaId) {
//       return res.status(400).json({ success: false, error: 'Missing images or mediaId' });
//     }

//     // Resolve image paths
//     const imagePaths = imageNames.map(name => path.join(__dirname, '..', 'uploads', path.basename(name)));

//     // Validate images exist
//     for (const imgPath of imagePaths) {
//       if (!fs.existsSync(imgPath)) {
//         return res.status(404).json({ success: false, error: `Image not found: ${imgPath}` });
//       }
//     }

//     let audioPath;
//     if (audioName) {
//       audioPath = path.join(__dirname, '..', 'uploads', 'audio', path.basename(audioName));
//       if (!fs.existsSync(audioPath)) {
//         return res.status(404).json({ success: false, error: 'Audio not found' });
//       }
//     } else {
//       // Generate TTS if no audio provided
//       const media = await Media.findById(mediaId);
//       if (!media) {
//         return res.status(404).json({ success: false, error: 'Media not found for TTS' });
//       }
//       const textToSpeak = media.story || media.description || 'Hello world';
//       const ttsFileName = `tts-${mediaId}.mp3`;
//       const ttsFilePath = path.join(__dirname, '..', 'uploads', 'audio', ttsFileName);

//       await generateVoiceOver(textToSpeak, ttsFileName);
//       audioPath = ttsFilePath;
//     }

//     const tempOutput = path.join(__dirname, '..', 'uploads', `temp-${Date.now()}.mp4`);

//     try {
//       await generateVideo(imagePaths, audioPath, tempOutput, 10);
//     } catch (ffmpegError) {
//       console.error('❌ Video generation failed:', ffmpegError);
//       return res.status(500).json({ success: false, error: 'Video generation failed', details: ffmpegError.message });
//     }

//     const b2Key = `videos/${path.basename(tempOutput)}`;
//     const signedUrl = await uploadToB2(tempOutput, b2Key);

//     await Media.findByIdAndUpdate(mediaId, {
//       renderId: b2Key,
//       storyUrl: signedUrl,
//       encodingStatus: 'completed',
//       mediaType: 'video',
//     });

//     res.json({ success: true, playbackUrl: signedUrl });

//     // Cleanup temp file
//     fs.unlink(tempOutput, (err) => {
//       if (err) console.warn('⚠️ Failed to delete temp video:', err);
//     });
//   } catch (err) {
//     console.error('❌ Unexpected server error:', err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

/**
 *
 * aws s3  Refresh signed URL for an existing  video
 */
// export const generateApiVideo = async (req, res) => {
//   try {
//     const { imageNames, audioName, mediaId } = req.body;
//     if (!imageNames?.length || !mediaId) {
//       return res.status(400).json({ success: false, error: "Missing images or mediaId" });
//     }

//     const uploadsDir = path.join(__dirname, "..", "uploads");
//     const audioDir = path.join(uploadsDir, "audio");
//     await fs.mkdir(audioDir, { recursive: true });

//     // Resolve image paths
//     const imagePaths = imageNames.map(name => path.join(uploadsDir, path.basename(name)));
//     for (const imgPath of imagePaths) {
//       if (!existsSync(imgPath)) return res.status(404).json({ success: false, error: `Image not found: ${imgPath}` });
//     }

//     // Fetch media
//     const media = await Media.findById(mediaId);
//     if (!media) return res.status(404).json({ success: false, error: "Media not found" });

//     // Determine audio
//     let audioPath;
//     if (media.voiceUrl) {
//       audioPath = path.join(audioDir, path.basename(media.voiceUrl));
//       if (!existsSync(audioPath)) return res.status(404).json({ success: false, error: "Stored audio not found" });
//     } else if (audioName) {
//       audioPath = path.join(audioDir, path.basename(audioName));
//       if (!existsSync(audioPath)) return res.status(404).json({ success: false, error: "Provided audio not found" });
//     } else {
//       const ttsFileName = `tts-${mediaId}.mp3`;
//       audioPath = path.join(audioDir, ttsFileName);
//       await generateVoiceOver(media.story || media.description || "Hello world", ttsFileName);
//       media.voiceUrl = `/uploads/audio/${ttsFileName}`;
//       await media.save();
//     }

//     // Generate video
//     const tempOutput = path.join(uploadsDir, `temp-${uuidv4()}.mp4`);
//     await generateVideo(imagePaths, audioPath, tempOutput, 10);

//     // Generate thumbnail
//     const localThumbPath = path.join(uploadsDir, `thumb-${uuidv4()}.jpg`);
//     await generateThumbnail(tempOutput, localThumbPath);

//     // Upload video & thumbnail to S3
//     const videoUrl = await uploadFileToS3(tempOutput, `videos/${path.basename(tempOutput)}`);
//     const thumbUrl = await uploadFileToS3(localThumbPath, `thumbnails/${path.basename(localThumbPath)}`);

//     // Save to DB
//     const FRONTEND_URL = process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com";
//     await Media.findByIdAndUpdate(mediaId, {
//       storyUrl: videoUrl,
//       thumbnailUrl: thumbUrl,
//       transcript: "", // optional placeholder
//       tags: [],
//       emotions: [],
//       encodingStatus: "completed",
//       mediaType: "video",
//       shares: 1,
//       createdAt: new Date(),
//     });

//     // Cleanup temp files safely
//     await Promise.all([
//       fs.unlink(tempOutput).catch(() => {}),
//       fs.unlink(localThumbPath).catch(() => {})
//     ]);

//     res.json({
//       success: true,
//       videoUrl,
//       thumbnailUrl: thumbUrl,
//       shortUrl: `${FRONTEND_URL}/m/${mediaId}`,
//     });

//   } catch (err) {
//     console.error("❌ Video generation failed:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };



// export const generateApiVideo = async (req, res) => {
//   try {
//     // const { imageNames, audioName, mediaId } = req.body;
//      const { imageNames, audioName, mediaId, userId } = req.body;

//     if (!imageNames || !Array.isArray(imageNames) || imageNames.length === 0 || !mediaId) {
//       return res.status(400).json({ success: false, error: 'Missing images or mediaId' });
//     }

//     // Resolve image paths
//     const imagePaths = imageNames.map(name => path.join(__dirname, '..', 'uploads', path.basename(name)));

//     // Validate images exist
//     for (const imgPath of imagePaths) {
//       if (!fs.existsSync(imgPath)) {
//         return res.status(404).json({ success: false, error: `Image not found: ${imgPath}` });
//       }
//     }

//     let audioPath;
//     if (audioName) {
//       audioPath = path.join(__dirname, '..', 'uploads', 'audio', path.basename(audioName));
//       if (!fs.existsSync(audioPath)) {
//         return res.status(404).json({ success: false, error: 'Audio not found' });
//       }
//     } else {
//       // Generate TTS if no audio provided
//       const media = await Media.findById(mediaId);
//       if (!media) {
//         return res.status(404).json({ success: false, error: 'Media not found for TTS' });
//       }
//       const textToSpeak = media.story || media.description || 'Hello world';
//       const ttsFileName = `tts-${mediaId}.mp3`;
//       const ttsFilePath = path.join(__dirname, '..', 'uploads', 'audio', ttsFileName);

//       await generateVoiceOver(textToSpeak, ttsFileName);
//       audioPath = ttsFilePath;
//     }

//     const tempOutput = path.join(__dirname, '..', 'uploads', `temp-${Date.now()}.mp4`);

//     try {
//       await generateVideo(imagePaths, audioPath, tempOutput, 10);
//     } catch (ffmpegError) {
//       console.error('❌ Video generation failed:', ffmpegError);
//       return res.status(500).json({ success: false, error: 'Video generation failed', details: ffmpegError.message });
//     }

//     // === NEW: Upload video automatically to YouTube ===
//     const media = await Media.findById(mediaId);
//     if (!media) {
//       return res.status(404).json({ success: false, error: 'Media not found' });
//     }
// try {
//       await setCredentialsFromDB(userId);  // load and set tokens for oauth client
//     } catch (err) {
//       console.error('Failed to set OAuth tokens:', err);
//       return res.status(401).json({ success: false, error: 'Unauthorized: Invalid YouTube credentials' });
//     }
//     try {
//       const youtubeResponse = await uploadVideo(
//         tempOutput,
//         media.title || 'Uploaded video',
//         media.description || ''
//       );
//       // youtubeResponse should contain video ID and info

//       const youtubeUrl = `https://youtu.be/${youtubeResponse.id}`;

//       // Update Media DB with YouTube URL
//       await Media.findByIdAndUpdate(mediaId, {
//         youtubeUrl,
//         encodingStatus: 'completed',
//         mediaType: 'video',
//         renderId: null,    // Optional: clear your B2 key if you want
//         storyUrl: youtubeUrl // Override playbackUrl with YouTube URL for frontend sharing
//       });

//       // Respond with YouTube URL
//       res.json({ success: true, playbackUrl: youtubeUrl });

//     } catch (ytErr) {
//       console.error('❌ YouTube upload failed:', ytErr);
//       return res.status(500).json({ success: false, error: 'YouTube upload failed', details: ytErr.message });
//     }

//     // Cleanup temp file
//     fs.unlink(tempOutput, (err) => {
//       if (err) console.warn('⚠️ Failed to delete temp video:', err);
//     });
//   } catch (err) {
//     console.error('❌ Unexpected server error:', err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };
