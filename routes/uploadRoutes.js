import express from 'express';
import { uploadMiddleware, handleUpload } from '../controllers/uploadController.js';
const router = express.Router();

router.post('/upload', uploadMiddleware, handleUpload);
export default router;