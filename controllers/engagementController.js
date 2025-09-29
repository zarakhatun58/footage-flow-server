// controllers/engagementController.js
import Media from "../models/Media.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com";

// simple linear score; tweak weights anytime
const calculateRankScore = ({ likes = 0, shares = 0, views = 0 }) =>
  (likes * 2) + (shares * 3) + (views * 1);

// Small helper to normalize MongoDB docs
const mapMedia = (media) => {
  if (!media) return null;
  const obj = media.toObject ? media.toObject() : media;
  return {
    ...obj,
    id: obj._id.toString(),
  };
};

// GET /api/media/:id
export const getMediaById = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ success: false, error: "Media not found" });
    res.json({ success: true, media: mapMedia(media) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/media/videos  (all videos, newest first)
export const getAllMedia = async (_req, res) => {
  try {
    const videos = await Media.find({ mediaType: "video" }).sort({ createdAt: -1 });
    res.json({ success: true, videos: videos.map(mapMedia) });
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

    res.json({ success: true,id: media._id.toString(), likes: media.likes, rankScore: media.rankScore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/media/:id/share
export const shareMedia = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      return res.status(404).json({ success: false, error: "Media not found" });
    }

    // Increment shares every time
    media.shares = (media.shares || 0) + 1;
    media.rankScore = calculateRankScore(media);

    await media.save();

    // Always generate short link — even if this is the first share
    // const shortUrl = `${FRONTEND_URL}/m/${media._id}`;
    const shortUrl = media.storyUrl;
    res.json({
      success: true,
       id: media._id.toString(),
      shares: media.shares,
      rankScore: media.rankScore,
      shortUrl,               // ✅ guaranteed to be here
      publicUrl: media.storyUrl
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

    res.json({ success: true,  id: media._id.toString(), views: media.views, rankScore: media.rankScore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/media/ranked?limit=20
export const getRankedMedia = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const videos = await Media
      .find({ mediaType: "video" })
      .sort({ rankScore: -1, createdAt: -1 })
      .limit(limit);

    res.json({ success: true, videos: videos.map(mapMedia) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/media/trending?days=7&limit=20
export const getTrendingMedia = async (req, res) => {
  try {
    const days = Math.max(parseInt(req.query.days || "7", 10), 1);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

    // simple approach: filter by createdAt and use rankScore
    const videos = await Media
      .find({ mediaType: "video", createdAt: { $gte: since } })
      .sort({ rankScore: -1, createdAt: -1 })
      .limit(limit);

    res.json({ success: true, videos: videos.map(mapMedia)  });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/media/:id/stats
export const getMediaStats = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      return res.status(404).json({ success: false, error: "Media not found" });
    }

    res.json({
      success: true,
       id: media._id.toString(),
      likes: media.likes || 0,
      shares: media.shares || 0,
      views: media.views || 0,
      rankScore: media.rankScore || 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


export const getShortUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const media = await Media.findById(id).select('storyUrl');
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    // Short link to your frontend watch page (e.g. /m/:id)
    const shortUrl = `${FRONTEND_URL}/m/${id}`;

    return res.json({
      success: true,
        id: media._id.toString(), 
      shortUrl,
      publicUrl: media.storyUrl || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const getTotalViews = async (_req, res) => {
  try {
    const result = await Media.aggregate([
      { $group: { _id: null, totalViews: { $sum: "$views" } } }
    ]);
    const totalViews = result[0]?.totalViews || 0;
    res.json({ success: true, totalViews });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};