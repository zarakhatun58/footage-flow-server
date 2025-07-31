import Video from '../models/Media.js';
import { transcribeAudio } from '../utils/transcriptMock.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

export const uploadMiddleware = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 2 },
  { name: 'voiceover', maxCount: 2 }
]);

export const handleUpload = async (req, res) => {
  try {
    const imageFiles = req.files?.images || [];
    const videoFile = req.files?.video?.[0];
    const voiceFile = req.files?.voiceover?.[0];

    const savedItems = [];

    // Handle Images
    for (const file of imageFiles) {
      const newImage = new Video({
        filename: file.filename,
        transcript: '',
        mediaType: 'image',
        createdAt: new Date()
      });
      await newImage.save();
      savedItems.push(newImage);
    }

    // Handle Video
    if (videoFile) {
      const transcript = await transcribeAudio(videoFile.path);
      const newVideo = new Video({
        filename: videoFile.filename,
        transcript,
        mediaType: 'video',
        createdAt: new Date()
      });
      await newVideo.save();
      savedItems.push(newVideo);
    }

    // Handle Voiceover
    if (voiceFile) {
      const transcript = await transcribeAudio(voiceFile.path);
      const newAudio = new Video({
        filename: voiceFile.filename,
        transcript,
        mediaType: 'audio',
        createdAt: new Date()
      });
      await newAudio.save();
      savedItems.push(newAudio);
    }

    res.status(201).json({
      success: true,
      uploaded: savedItems
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
};