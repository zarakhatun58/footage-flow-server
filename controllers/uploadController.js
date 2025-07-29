import Video from '../models/Video.js';
import { transcribeAudio } from '../utils/transcriptMock.js';
import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

export const uploadMiddleware = upload.single('video');

export const handleUpload = async (req, res) => {
  try {
    const filePath = req.file.path;
    const transcript = await transcribeAudio(filePath);
    const newVideo = new Video({ filename: req.file.filename, transcript });
    await newVideo.save();
    res.json(newVideo);
  } catch (err) {
    console.error(err);
    res.status(500).send('Upload failed');
  }
};