import express from 'express';
import { getAuthUrl, getTokens, uploadVideo } from '../utils/youtubeClient.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Route to get auth URL (send to frontend)
router.get('/auth-url', (req, res) => {
  const url = getAuthUrl();
  res.json({ url });
});

// OAuth callback route
router.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  const userId = req.session.userId; // Replace with your auth logic

  try {
    const tokens = await getTokens(code, userId);
    res.send('YouTube authentication successful. You can now close this window.');
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to get tokens');
  }
});

// Upload video route (after video generated)
router.post('/upload-video', upload.single('video'), async (req, res) => {
  const userId = req.session.userId; // Replace with your auth logic
  const videoPath = req.file.path;
  const { title, description } = req.body;

  try {
    // Make sure userId is set on oauth client for token refresh saving
    uploadVideo.oauth2Client = oauth2Client;
    oauth2Client.userIdForTokenSave = userId;

    const data = await uploadVideo(userId, videoPath, title, description);
    res.json({ success: true, youtubeVideoId: data.id, youtubeUrl: `https://youtu.be/${data.id}` });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
