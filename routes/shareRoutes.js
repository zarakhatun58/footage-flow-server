import express from 'express';
import Media from '../models/Media.js';

const router = express.Router();

const calculateRankScore = ({ likes, shares, views }) => {
  return (likes * 2) + (shares * 3) + (views || 0); // Default views to 0 if undefined
};

// Like a media post
router.post('/:id/like', async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    media.likes += 1;
    media.rankScore = calculateRankScore(media);
    await media.save();

    res.json({ success: true, likes: media.likes, rankScore: media.rankScore });
  } catch (err) {
    res.status(500).json({ error: 'Failed to like media' });
  }
});



// Share a media post
router.post('/:id/share', async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    media.shares += 1;
    media.rankScore = calculateRankScore(media);
    await media.save();

    res.json({ success: true, shares: media.shares, rankScore: media.rankScore });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share media' });
  }
});

router.post('/:id/view', async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    media.views = (media.views || 0) + 1;
    media.rankScore = calculateRankScore(media);
    await media.save();

    res.json({ success: true, views: media.views, rankScore: media.rankScore });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record view' });
  }
});


export default router;
