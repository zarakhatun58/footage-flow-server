import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToB2 } from '../utils/uploadToB2.js';
import { generateVideo } from '../utils/generateVideo.js';
import Media from '../models/Media.js';

// __dirname workaround for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a video locally using FFmpeg, upload it to B2, and return a signed URL
 */
export const generateApiVideo = async (req, res) => {
  try {
    const { imageName, audioName, mediaId } = req.body;

    if (!imageName || !audioName || !mediaId) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing image, audio, or mediaId' });
    }

    // Paths for uploaded assets
    const imagePath = path.join(
      __dirname,
      '..',
      'uploads',
      path.basename(imageName)
    );
    const audioPath = path.join(
      __dirname,
      '..',
      'uploads',
      'audio',
      path.basename(audioName)
    );

    if (!fs.existsSync(imagePath)) {
      return res
        .status(404)
        .json({ success: false, error: 'Image not found' });
    }
    if (!fs.existsSync(audioPath)) {
      return res
        .status(404)
        .json({ success: false, error: 'Audio not found' });
    }

    // Temporary output file
    const tempOutput = path.join(
      __dirname,
      '..',
      'uploads',
      `temp-${Date.now()}.mp4`
    );

    // Step 1 — Generate video locally (pass strings, not arrays)
    await generateVideo(audioPath, imagePath, tempOutput);

    // Step 2 — Upload to Backblaze B2
    const b2Key = `videos/${path.basename(tempOutput)}`;
    const signedUrl = await uploadToB2(tempOutput, b2Key);

    // Step 3 — Save to DB
    await Media.findByIdAndUpdate(mediaId, {
      renderId: b2Key,
      storyUrl: signedUrl,
      encodingStatus: 'completed',
      mediaType: 'video',
    });

    // Step 4 — Send response
    res.json({
      success: true,
      playbackUrl: signedUrl,
    });

    // Step 5 — Clean up local temp file
    fs.unlink(tempOutput, () => {});
  } catch (err) {
    console.error('❌ Video generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Refresh signed URL for an existing B2 video
 */
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
