

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToB2 } from '../utils/uploadToB2.js';
import { generateVideo } from '../utils/generateVideo.js';
import Media from '../models/Media.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js'; // your existing TTS

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

    // Check all images exist
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
      // No audio uploaded — generate TTS audio from media text
      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({ success: false, error: 'Media not found for TTS' });
      }
      const textToSpeak = media.story || media.description || 'Hello world';
      const ttsFileName = `tts-${mediaId}.mp3`;
      const ttsFilePath = path.join(__dirname, '..', 'uploads', 'audio', ttsFileName);

      // Generate voice-over mp3
      await generateVoiceOver(textToSpeak, ttsFileName);

      audioPath = ttsFilePath;
    }

    // Prepare temp output video path
    const tempOutput = path.join(__dirname, '..', 'uploads', `temp-${Date.now()}.mp4`);

    // Generate video: audioPath (string), imagePaths (array), output filename
    await generateVideo(imagePaths, audioPath, path.basename(tempOutput));

    // Upload video to B2
    const b2Key = `videos/${path.basename(tempOutput)}`;
    const signedUrl = await uploadToB2(tempOutput, b2Key);

    // Update DB record
    await Media.findByIdAndUpdate(mediaId, {
      renderId: b2Key,
      storyUrl: signedUrl,
      encodingStatus: 'completed',
      mediaType: 'video',
    });

    // Send response with playback URL
    res.json({ success: true, playbackUrl: signedUrl });

    // Cleanup temp video file
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
