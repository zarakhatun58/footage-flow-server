import express from 'express';
import {
  getAllVideos,
  generateStory,
  generateTags,
  saveStory,
  createStory,
  handleUploadAndGenerateVideo,
  searchVideos,
  generateTagsAndStory,
  generateAndRenderVideo,
  checkRenderStatus
} from '../controllers/storyController.js';
import Story from '../models/Story.js';

const router = express.Router();

router.get('/videos', getAllVideos);
router.post('/generate', generateStory);
router.post('/upload-and-generate-video', handleUploadAndGenerateVideo);
router.post('/tags', generateTags);
router.post('/save', saveStory);
router.post('/story', createStory);
router.get('/search-videos', searchVideos);
router.post('/story/generate-all', generateTagsAndStory);
router.post('/speech/generate-video', generateAndRenderVideo);
router.get('/speech/render-status/:renderId', checkRenderStatus);

// New endpoint for dynamic suggested searches:
router.get('/search-suggestions', async (req, res) => {
  try {
    // You can replace this with DB-driven popular tags or saved searches
    const suggestions = [
      { text: "birthday celebrations", type: "celebration" },
      { text: "family gatherings", type: "family" },
      { text: "vacation memories", type: "travel" },
      { text: "recent moments", type: "recent" },
    ];
    res.status(200).json({ suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ suggestions: [] });
  }
});

// Helper to parse time "HH:MM:SS" to seconds
const timeToSeconds = (timeStr) => {
  const parts = timeStr.split(':').map(Number);
  let seconds = 0;
  for (let i = 0; i < parts.length; i++) {
    seconds = seconds * 60 + parts[i];
  }
  return seconds;
};

// http://localhost:5000/api/videos/:videoId/clip?start=HH:MM:SS&duration=seconds
// GET /api/videos/:videoId/clip?start=HH:MM:SS&duration=seconds
router.get('/:videoId/clip', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { start, duration } = req.query;

    const video = await Media.findById(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    // Convert start time to seconds for any processing
    const startSeconds = timeToSeconds(start || '00:00:00');
    const clipDuration = Number(duration) || 30;

    // Assuming video.storyUrl is the full video URL
    // For simplicity, we return the full video URL + params (frontend will handle seeking)
    res.json({
      clipUrl: video.storyUrl,
      startSeconds,
      clipDuration,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clip' });
  }
});


// http://localhost:5000/api/newStory
router.post('/newStory', async (req, res) => {
  try {
    const story = new Story({ clips: [] });
    await story.save();
    res.json(story);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create story' });
  }
});


// Add clip to story  http://localhost:5000/api/:storyId/add-clip
router.post('/:storyId/add-clip', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { videoId, timestamp, duration, transcript, tags } = req.body;

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });

    story.clips.push({ videoId, timestamp, duration, transcript, tags });
    await story.save();

    res.json({ message: 'Clip added', clip: story.clips[story.clips.length - 1] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add clip to story' });
  }
});

export default router;
