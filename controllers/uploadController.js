import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Media from '../models/Media.js';
import { transcribeAudio } from '../utils/transcribeAudio.js';
import { getEmotionLabels } from '../utils/emotion.js';
import visionClient from '../utils/visionClient.js';

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

export const uploadMiddleware = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 2 },
  { name: 'voiceover', maxCount: 2 }
]);

const generateTagsFromTranscript = async (transcript) => {
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
    console.error('❌ Vision API error:', err);
    return '';
  }
};
// Handle Upload
export const handleUpload = async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const uploaded = [];

    const allFiles = [...(req.files.video || []), ...(req.files.voiceover || []), ...(req.files.images || [])];

    for (const file of allFiles) {
      const filePath = file.path;
      const mimeType = file.mimetype;

      let mediaType = '';
      if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';
      else if (mimeType.startsWith('image/')) mediaType = 'image';
      else mediaType = 'other';

      let transcript = '';
      let emotions = [];

      // ✅ Only run transcription for audio/video
      if (mediaType === 'audio' || mediaType === 'video') {
        try {
          transcript = await transcribeAudioOrVideo(filePath);
          emotions = await getEmotionLabels(transcript);
        } catch (err) {
          console.error('Transcription/Emotion error:', err);
        }
      }

      // ✅ For images, optionally generate a descriptive prompt or emotion via GPT
      if (mediaType === 'image') {
        transcript = `Describe this image in a sentence. Filename: ${file.originalname}`;
        emotions = []; // or call a vision model API if needed
      }

      const newVideo = new Video({
        filename: file.filename,
        mediaType,
        transcript,
        emotions,
        tags: [],
        likes: 0,
        shares: 0,
        status: 'uploaded'
      });

      await newVideo.save();
      uploaded.push(newVideo);
    }

    res.status(200).json({ uploaded });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

