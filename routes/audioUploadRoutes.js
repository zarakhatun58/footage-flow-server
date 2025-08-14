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

const API_PUBLIC_URL = process.env.API_PUBLIC_URL || 'http://localhost:5000';


// Unified route — upload OR generate audio
router.post('/:mediaId', upload.single('file'), async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { text } = req.body;

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    let audioPath;
    if (req.file) {
      // 📌 Manual file/record upload
      audioPath = `/uploads/audio/${req.file.filename}`;
    } else if (text) {
      // 📌 Auto-generate from text
      audioPath = await generateVoiceOver(text, `voice-${mediaId}.mp3`);
    } else {
      return res.status(400).json({ success: false, error: 'No file or text provided' });
    }

    // Save latest audio
    media.voiceUrl = audioPath;
    await media.save();

    res.json({
      success: true,
      audioUrl: `${API_PUBLIC_URL}${audioPath}`,
      message: req.file ? 'Audio uploaded successfully' : 'Audio generated successfully'
    });
  } catch (error) {
    console.error('Audio handling failed:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

//generate audio


// router.post('/generate-audio/:mediaId', async (req, res) => {
//   const { mediaId } = req.params;
//   const { text } = req.body;

//   if (!text) {
//     return res.status(400).json({ success: false, error: 'No text provided' });
//   }

//   try {
//     // Generate audio
//     const audioRelativePath = await generateVoiceOver(text, `voice-${mediaId}.mp3`);

//     // Find the media document
//     const media = await Media.findById(mediaId);
//     if (!media) {
//       return res.status(404).json({ success: false, error: 'Media not found' });
//     }

//     // Save path in DB
//     media.voiceUrl = audioRelativePath;
//     await media.save();

//     // ✅ Serve from backend
//     const publicUrl = `${API_PUBLIC_URL}${audioRelativePath}`;

//     res.json({ success: true, audioUrl: publicUrl });
//   } catch (error) {
//     console.error('TTS generation failed:', error);
//     res.status(500).json({ success: false, error: 'Failed to generate audio' });
//   }
// });


export default router;
