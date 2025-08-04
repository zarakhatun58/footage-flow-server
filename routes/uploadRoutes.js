import express from 'express';
import { uploadMiddleware, handleUpload } from '../controllers/uploadController.js';
const router = express.Router();

router.post('/uploads', uploadMiddleware, handleUpload);
export default router;