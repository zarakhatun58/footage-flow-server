import express from 'express';
import {  generateApiVideo, checkApiVideoStatus, getAllVideos, saveFinalVideo, deleteVideo,editVideo  } from '../controllers/videoController.js';

const router = express.Router();
// POST → generate a video from image + audio, upload to B2, return signed URL
router.post('/generate', generateApiVideo);

// GET → get a fresh signed URL for an existing video stored in B2
router.get('/status/:videoId', checkApiVideoStatus);

// - /api/apivideo
router.get('/all-generate-video', getAllVideos);

router.post("/upload-final", saveFinalVideo);
router.delete("/delete/:id", deleteVideo);
router.put("/edit/:id", editVideo);


export default router;
