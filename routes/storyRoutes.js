import express from 'express';
import {
  getAllVideos,
  generateStory,
  generateTags,
  saveStory,
  createStory
} from '../controllers/storyController.js';

const router = express.Router();

router.get('/videos', getAllVideos);
router.post('/generate', generateStory);
router.post('/tags', generateTags);
router.post('/save', saveStory);
router.post('/story', createStory);


export default router;
