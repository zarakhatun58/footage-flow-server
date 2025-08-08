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
    let { imageName, audioName, mediaId } = req.body;

    if (!imageName || !audioName || !mediaId) {
      return res.status(400).json({ success: false, error: 'Missing image, audio, or mediaId' });
    }

    // 🔹 Normalize imageName to array
    if (!Array.isArray(imageName)) {
      imageName = [imageName];
    }

    // Build image paths
    const imagePaths = imageName.map(img =>
      path.join(__dirname, '..', 'uploads', path.basename(img))
    );
    const audioPath = path.join(__dirname, '..', 'uploads', 'audio', path.basename(audioName));

    // Check files exist
    for (const imgPath of imagePaths) {
      if (!fs.existsSync(imgPath)) {
        return res.status(404).json({ success: false, error: `Image not found: ${imgPath}` });
      }
    }
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ success: false, error: 'Audio not found' });
    }

    const tempOutput = path.join(__dirname, '..', 'uploads', `temp-${Date.now()}.mp4`);

    // ✅ Correct param order — multiple images supported
    await generateVideo(imagePaths, audioPath, path.basename(tempOutput));

    const b2Key = `videos/${path.basename(tempOutput)}`;
    const signedUrl = await uploadToB2(tempOutput, b2Key);

    await Media.findByIdAndUpdate(mediaId, {
      renderId: b2Key,
      storyUrl: signedUrl,
      encodingStatus: 'completed',
      mediaType: 'video'
    });

    res.json({ success: true, playbackUrl: signedUrl });

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
