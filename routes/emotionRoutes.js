import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { transcribeAudio } from '../utils/transcriptMock.js';

const router = express.Router();

// Use multer to handle file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// Route: POST /api/emotion
router.post('/emotion', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file?.path;

    if (!filePath) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await transcribeAudio(filePath);

    // Optional: delete the uploaded file after processing
    fs.unlink(filePath, () => {});

    if (!result) {
      return res.status(500).json({ error: 'Failed to process audio' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error in /emotion:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
