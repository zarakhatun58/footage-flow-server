import express from 'express';
import {  generateApiVideo, checkApiVideoStatus, getAllVideos, saveFinalVideo } from '../controllers/videoController.js';

const router = express.Router();
// POST → generate a video from image + audio, upload to B2, return signed URL
router.post('/generate', generateApiVideo);

// GET → get a fresh signed URL for an existing video stored in B2
router.get('/status/:videoId', checkApiVideoStatus);

// - /api/apivideo
router.get('/all-generate-video', getAllVideos);

router.post("/upload-final", saveFinalVideo);
export default router;
