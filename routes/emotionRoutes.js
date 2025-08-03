import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { transcribeAudio } from '../utils/transcribeAudio.js';
import { getEmotionLabels } from '../utils/emotion.js';
import Media from '../models/Media.js'; // ✅ Import your MongoDB model

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.post('/story/emotion', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file?.path;
    const filename = req.file?.originalname;

    if (!filePath || !filename) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await transcribeAudio(filePath);
    fs.unlink(filePath, () => {}); // Clean up uploaded file

    if (!result) {
      return res.status(500).json({ error: 'Failed to process audio' });
    }

    const transcript = result.transcript;

    const tags = transcript
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter((word, i, arr) => word.length > 4 && arr.indexOf(word) === i)
      .slice(0, 5);

    const emotions = await getEmotionLabels(transcript);

    // ✅ Save to DB
    const media = new Media({
      filename,
      mediaType: 'audio',
      transcript,
      tags,
      emotions,
      status: 'uploaded',
      createdAt: new Date()
    });

    await media.save();

    res.status(201).json({
      success: true,
      message: 'Media uploaded and saved successfully',
      media
    });

  } catch (error) {
    console.error('Error in /story/emotion:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
