
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToB2 } from '../utils/uploadToB2.js';
import { generateVideo } from '../utils/generateVideo.js';
import Media from '../models/Media.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateApiVideo = async (req, res) => {
  try {
    const { imageNames, audioName, mediaId } = req.body;

    if (!imageNames || !Array.isArray(imageNames) || imageNames.length === 0 || !mediaId) {
      return res.status(400).json({ success: false, error: 'Missing images or mediaId' });
    }

    // Resolve image paths
    const imagePaths = imageNames.map(name => path.join(__dirname, '..', 'uploads', path.basename(name)));

    // Validate images exist
    for (const imgPath of imagePaths) {
      if (!fs.existsSync(imgPath)) {
        return res.status(404).json({ success: false, error: `Image not found: ${imgPath}` });
      }
    }

    let audioPath;
    if (audioName) {
      audioPath = path.join(__dirname, '..', 'uploads', 'audio', path.basename(audioName));
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ success: false, error: 'Audio not found' });
      }
    } else {
      // Generate TTS if no audio provided
      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({ success: false, error: 'Media not found for TTS' });
      }
      const textToSpeak = media.story || media.description || 'Hello world';
      const ttsFileName = `tts-${mediaId}.mp3`;
      const ttsFilePath = path.join(__dirname, '..', 'uploads', 'audio', ttsFileName);

      await generateVoiceOver(textToSpeak, ttsFileName);
      audioPath = ttsFilePath;
    }

    const tempOutput = path.join(__dirname, '..', 'uploads', `temp-${Date.now()}.mp4`);

    try {
      await generateVideo(imagePaths, audioPath, tempOutput, 10);
    } catch (ffmpegError) {
      console.error('❌ Video generation failed:', ffmpegError);
      return res.status(500).json({ success: false, error: 'Video generation failed', details: ffmpegError.message });
    }

    const b2Key = `videos/${path.basename(tempOutput)}`;
    const signedUrl = await uploadToB2(tempOutput, b2Key);

    await Media.findByIdAndUpdate(mediaId, {
      renderId: b2Key,
      storyUrl: signedUrl,
      encodingStatus: 'completed',
      mediaType: 'video',
    });

    res.json({ success: true, playbackUrl: signedUrl });

    // Cleanup temp file
    fs.unlink(tempOutput, (err) => {
      if (err) console.warn('⚠️ Failed to delete temp video:', err);
    });
  } catch (err) {
    console.error('❌ Unexpected server error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 
 * Refresh signed URL for an existing B2 video
 */

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
      return res
        .status(400)
        .json({ success: false, error: 'Missing video ID' });
    }

    // Get a new signed URL
    const signedUrl = await uploadToB2(null, videoId);

    res.json({
      success: true,
      playbackUrl: signedUrl,
    });
  } catch (err) {
    console.error('❌ Error getting signed URL:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
