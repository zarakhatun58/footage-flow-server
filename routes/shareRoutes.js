import express from 'express';
import Media from '../models/Media.js';

const router = express.Router();

// Like a media post
router.post('/:id/like', async (req, res) => {
  try {
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    res.json({ success: true, likes: media.likes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to like media' });
  }
});

// Share a media post
router.post('/:id/share', async (req, res) => {
  try {
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { $inc: { shares: 1 } },
      { new: true }
    );
    res.json({ success: true, shares: media.shares });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share media' });
  }
});

export default router;
