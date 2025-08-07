// routes/generateVideo.js
import express from 'express';

import path from 'path';
import { generateVideo } from '../utils/generateVideo.js';
import Media from '../models/Media.js';

const router = express.Router();

// POST /api/generate-video/:mediaId
router.post('/:mediaId', async (req, res) => {
  
    const { mediaId } = req.params;
    try {
    const media = await Media.findById(mediaId);
    if (!media) return res.status(404).json({ success: false, error: 'Media not found' });

    const audioUrl = media.voiceUrl;
    const imageUrls = media.images;

    if (!audioUrl || !imageUrls?.length) {
      return res.status(400).json({ success: false, error: 'Audio or images missing in media' });
    }

    const videoName = `${mediaId}.mp4`;

    const videoPath = await generateVideo(audioUrl, imageUrls, videoName);

    media.storyUrl = `/output/${videoName}`;
    media.status = 'completed';
    await media.save();

    res.status(200).json({ success: true, videoUrl: media.storyUrl });

  } catch (err) {
    console.error('🎥 Video generation failed:', err.message || err);
    res.status(500).json({ success: false, error: 'Video generation failed' });
  }
})
export default router;
