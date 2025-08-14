
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToB2 } from '../utils/uploadToB2.js';
import { generateVideo } from '../utils/generateVideo.js';
import Media from '../models/Media.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js';
import { uploadFileToS3 } from '../utils/uploadToS3.js';
import { generateThumbnail } from '../utils/generateThumbnail.js';
import { getSignedUrlFromS3 } from '../utils/s3Client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
export const generateApiVideo = async (req, res) => {
  try {
    const { imageNames, audioName, mediaId } = req.body;

    if (!imageNames || !Array.isArray(imageNames) || imageNames.length === 0 || !mediaId) {
      return res.status(400).json({ success: false, error: "Missing images or mediaId" });
    }

    // 1️⃣ Resolve image paths
    const imagePaths = imageNames.map(name =>
      path.join(__dirname, "..", "uploads", path.basename(name))
    );

    for (const imgPath of imagePaths) {
      if (!fs.existsSync(imgPath)) {
        return res.status(404).json({ success: false, error: `Image not found: ${imgPath}` });
      }
    }

    // 2️⃣ Always check DB for correct audio (overrides frontend value) 🔹 UPDATED
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ success: false, error: "Media not found" });
    }

    let audioPath;
    if (media.voiceUrl) {
      // ✅ Use stored voiceUrl path
      const storedAudioName = path.basename(media.voiceUrl);
      audioPath = path.join(__dirname, "..", "uploads", "audio", storedAudioName);

      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ success: false, error: "Stored audio not found" });
      }
    } 
    else if (audioName) {
      // ✅ If media.voiceUrl is missing, fall back to frontend-provided audioName
      audioPath = path.join(__dirname, "..", "uploads", "audio", path.basename(audioName));

      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ success: false, error: "Provided audio not found" });
      }
    } 
    else {
      // ✅ If no audio at all, auto-generate from story or description
      const textToSpeak = media.story || media.description || "Hello world";
      const ttsFileName = `tts-${mediaId}.mp3`;
      audioPath = path.join(__dirname, "..", "uploads", "audio", ttsFileName);
      await generateVoiceOver(textToSpeak, ttsFileName);
    }

    // 3️⃣ Generate temp video
    const tempOutput = path.join(__dirname, "..", "uploads", `temp-${Date.now()}.mp4`);
    await generateVideo(imagePaths, audioPath, tempOutput, 10);

    // 4️⃣ Generate thumbnail
    const localThumbPath = path.join(
      path.dirname(tempOutput),
      `thumb-${path.basename(tempOutput, ".mp4")}.jpg`
    );
    await generateThumbnail(tempOutput, localThumbPath);

    // 5️⃣ Upload video & thumbnail to S3
    const s3VideoKey = `videos/${path.basename(tempOutput)}`;
    const videoUrl = await uploadFileToS3(tempOutput, s3VideoKey);
    const s3ThumbKey = `thumbnails/${path.basename(localThumbPath)}`;
    const thumbUrl = await uploadFileToS3(localThumbPath, s3ThumbKey);

    // 6️⃣ AI: Transcript, Tags, Emotions
    const transcript = await generateTranscript(tempOutput);
    const tags = await generateTags(transcript);
    const emotions = await detectEmotions(transcript);

    // 7️⃣ Save everything in DB + auto short URL
    const FRONTEND_URL = process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com";
    const shortUrl = `${FRONTEND_URL}/m/${mediaId}`;

    await Media.findByIdAndUpdate(mediaId, {
      storyUrl: videoUrl,
      thumbnailUrl: thumbUrl,
      transcript,
      tags,
      emotions,
      encodingStatus: "completed",
      mediaType: "video",
      shares: 1, // auto-count as shared
      createdAt: new Date(),
    });

    // 8️⃣ Cleanup temp files
    fs.unlinkSync(tempOutput);
    fs.unlinkSync(localThumbPath);

    // 9️⃣ Respond with everything ready for sharing
    res.json({
      success: true,
      videoUrl,
      thumbnailUrl: thumbUrl,
      transcript,
      tags,
      emotions,
      shortUrl
    });

  } catch (err) {
    console.error("❌ Video generation failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};




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


export const saveFinalVideo = async (req, res) => {
  try {
    const { mediaId, localPath } = req.body; // localPath: where FFmpeg saved the file
    if (!fs.existsSync(localPath)) {
      return res.status(400).json({ error: "Video file not found" });
    }

    const s3Key = `videos/${path.basename(localPath)}`;
    const videoUrl = await uploadFileToS3(localPath, s3Key);

    await Media.findByIdAndUpdate(mediaId, {
      storyUrl: videoUrl,
      encodingStatus: "completed",
    });

    // delete local file to save space
    fs.unlinkSync(localPath);

    res.json({ success: true, url: videoUrl });
  } catch (err) {
    console.error("Error uploading video to S3:", err);
    res.status(500).json({ error: "Failed to upload to S3" });
  }
};