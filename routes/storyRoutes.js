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
  generateAndRenderVideo
} from '../controllers/storyController.js';

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


export default router;
