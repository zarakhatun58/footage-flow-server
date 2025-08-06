import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Media from '../models/Media.js';

import { getEmotionLabels } from '../utils/emotion.js';
import visionClient from '../utils/visionClient.js';
import { transcribeAudio } from '../utils/transcriptionService.js';
import { createVideoWithVoice } from '../utils/shotstackService.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

export const uploadMiddleware = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 },
  { name: 'voiceover', maxCount: 1 }
]);

export const generateTagsFromTranscript = async (transcript) => {
  const words = transcript
    .replace(/[^\w\s]/gi, '')
    .split(/\s+/)
    .filter((word, i, arr) => word.length > 4 && arr.indexOf(word) === i);

  return words.slice(0, 5);
};

export const getImageTranscript = async (imagePath) => {
  try {
    const [result] = await visionClient.textDetection(imagePath);
    const detections = result.textAnnotations;
    const transcript = detections[0]?.description || '';
    return transcript.trim();
  } catch (err) {
    console.error('❌ Vision API error:', err.message || err);
    return '';
  }
};

export const handleUpload = async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const uploaded = [];
    const imageFiles = req.files.images || [];
    const videoFiles = req.files.video || [];
    const voiceFiles = req.files.voiceover || [];

    for (const file of [...imageFiles, ...videoFiles, ...voiceFiles]) {
      const filePath = file.path;
      const mimeType = file.mimetype;

      let mediaType = '';
      if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';
      else if (mimeType.startsWith('image/')) mediaType = 'image';
      else mediaType = 'unknown';

      const storyUrl = mediaType === 'video'
        ? `${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}/uploads/${file.filename}`
        : '';

      const images = mediaType === 'image'
        ? [`${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}/uploads/${file.filename}`]
        : [];

      // 🔧 [CHANGED] Save initial empty media first (with processing status)
      const newMedia = new Media({
        filename: file.filename,
        mediaType,
        transcript: '',
        emotions: [],
        tags: [],
        storyUrl,
        images,
        likes: 0,
        shares: 0,
        rankScore: 0,
        status: 'processing'
      });

      await newMedia.save();

      // 🔧 [ADDED] Blocking metadata processing before response
      let transcript = '';
      let emotions = [];
      let tags = [];

      try {
        if (mediaType === 'audio') {
          transcript = await transcribeAudio(filePath);
          emotions = await getEmotionLabels(transcript);
          tags = await generateTagsFromTranscript(transcript);
        } else if (mediaType === 'image') {
          transcript = await getImageTranscript(filePath);
          emotions = await getEmotionLabels(transcript);
          tags = await generateTagsFromTranscript(transcript);
        }

        // 🔧 [ADDED] Update media before returning
        newMedia.transcript = transcript;
        newMedia.emotions = emotions;
        newMedia.tags = tags;
        newMedia.status = 'completed';

        await newMedia.save();
      } catch (err) {
        console.error(`❌ Error processing ${mediaType}:`, err);
        newMedia.status = 'error';
        await newMedia.save();
      }

      // 🔧 [CHANGED] Push fully updated media to response array
      uploaded.push(newMedia);
    }

    // 🔧 [CHANGED] Return full metadata in response
    return res.status(200).json({ uploaded });
  } catch (error) {
    console.error('❌ Upload error:', error.message || error);
    res.status(500).json({ error: 'Upload failed.' });
  }
};



