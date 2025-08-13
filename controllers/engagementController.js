// controllers/engagementController.js
import Media from "../models/Media.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://your-frontend.example.com";

// simple linear score; tweak weights anytime
const calculateRankScore = ({ likes = 0, shares = 0, views = 0 }) =>
  (likes * 2) + (shares * 3) + (views * 1);

// GET /api/media/:id
export const getMediaById = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ success: false, error: "Media not found" });
    res.json({ success: true, media });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/media/videos  (all videos, newest first)
export const getAllVideos = async (_req, res) => {
  try {
    const videos = await Media.find({ mediaType: "video" }).sort({ createdAt: -1 });
    res.json({ success: true, videos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/media/:id/like
export const likeMedia = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ success: false, error: "Media not found" });

    media.likes = (media.likes || 0) + 1;
    media.rankScore = calculateRankScore(media);
    await media.save();

    res.json({ success: true, likes: media.likes, rankScore: media.rankScore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/media/:id/share
export const shareMedia = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ success: false, error: "Media not found" });

    media.shares = (media.shares || 0) + 1;
    media.rankScore = calculateRankScore(media);
    await media.save();

    // handy short link your frontend can resolve to a watch page
    const shortUrl = `${FRONTEND_URL}/m/${media._id}`;

    res.json({
      success: true,
      shares: media.shares,
      rankScore: media.rankScore,
      shortUrl,
      publicUrl: media.storyUrl // direct S3 URL you already store
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/media/:id/view
export const viewMedia = async (req, res) => {
  try {
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { views: 1 },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );
    if (!media) return res.status(404).json({ success: false, error: "Media not found" });

    media.rankScore = calculateRankScore(media);
    await media.save();

    res.json({ success: true, views: media.views, rankScore: media.rankScore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/media/ranked?limit=20
export const getRankedVideos = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const videos = await Media
      .find({ mediaType: "video" })
      .sort({ rankScore: -1, createdAt: -1 })
      .limit(limit);

    res.json({ success: true, videos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// OPTIONAL: trending by last N days with decay (heavier on new engagement)
// GET /api/media/trending?days=7&limit=20
export const getTrendingVideos = async (req, res) => {
  try {
    const days = Math.max(parseInt(req.query.days || "7", 10), 1);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

    // simple approach: filter by createdAt and use rankScore
    const videos = await Media
      .find({ mediaType: "video", createdAt: { $gte: since } })
      .sort({ rankScore: -1, createdAt: -1 })
      .limit(limit);

    res.json({ success: true, videos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
