import express from 'express';
import {  handleUpload } from '../controllers/uploadController.js';
import { uploadMiddleware } from '../middleware/upload.middleware.js';
const router = express.Router();

router.post('/uploads', uploadMiddleware, handleUpload);
export default router;