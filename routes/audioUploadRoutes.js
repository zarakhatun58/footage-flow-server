import express from 'express';
import multer from 'multer';
import path from 'path';
import Media from '../models/Media.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js';

const router = express.Router();

// Set up Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/audio'); // Ensure this folder exists
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = Date.now() + ext;
    cb(null, name);
  }
});

const upload = multer({ storage });

// Audio upload route
router.post('/:mediaId', upload.single('file'), async (req, res) => {
  try {
    const mediaId = req.params.mediaId;
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file uploaded' });
    }

    // ✅ Save audio file path in media document
    media.voiceUrl = `/uploads/audio/${req.file.filename}`;
    await media.save();

    res.json({
      success: true,
      audioUrl: media.voiceUrl,
      message: 'Audio uploaded and linked successfully'
    });

  } catch (error) {
    console.error('Audio upload failed:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/generate-audio/:mediaId', async (req, res) => {
  const { mediaId } = req.params;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, error: 'No text provided' });
  }

  try {
    // Generate audio file and get relative path like '/uploads/voice-123.mp3'
    const audioRelativePath = await generateVoiceOver(text, `voice-${mediaId}.mp3`);

    // Find the media document
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    // Save relative path to DB
    media.voiceUrl = audioRelativePath;
    await media.save();

    // Construct public URL to send back
    const publicUrl = `${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}${audioRelativePath}`;

    res.json({ success: true, audioUrl: publicUrl });
  } catch (error) {
    console.error('TTS generation failed:', error);
    res.status(500).json({ success: false, error: 'Failed to generate audio' });
  }
});

export default router;
