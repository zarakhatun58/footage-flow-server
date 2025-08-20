// middleware/upload.middleware.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure base upload dirs exist
['uploads', 'uploads/audio'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, 'uploads/audio');
    } else {
      cb(null, 'uploads');
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

// 🔹 Export base upload instance
export { upload };

// 🔹 Export ready-to-use middleware for routes
export const uploadMiddleware = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 },
  { name: 'voiceover', maxCount: 1 }
]);
