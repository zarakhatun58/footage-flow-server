import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import Media from '../models/Media.js';
import { exec } from 'child_process';

const API_KEY = process.env.APIVIDEO_API_KEY;
const BASE_URL = 'https://ws.api.video';

export const generateApiVideo = async (req, res) => {
  const { imageName, audioName, mediaId } = req.body;

  if (!imageName || !audioName || !mediaId) {
    return res.status(400).json({ success: false, error: 'Missing image, audio, or mediaId' });
  }

  const imagePath = path.join('uploads', path.basename(imageName));
  const audioPath = path.join('uploads/audio', path.basename(audioName));
  const outputVideo = `uploads/generated-${Date.now()}.mp4`;

  try {
    // Step 1: Create a new video container
    const createVideoRes = await axios.post(`${BASE_URL}/videos`, {
      title: 'Generated Video',
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const videoId = createVideoRes.data.videoId;
    if (!videoId) {
      throw new Error('❌ Video ID not returned from api.video');
    }

    // Step 2: Generate video using ffmpeg
    const ffmpegCmd = `ffmpeg -loop 1 -i ${imagePath} -i ${audioPath} -c:v libx264 -tune stillimage -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -y ${outputVideo}`;
    await new Promise((resolve, reject) => {
      exec(ffmpegCmd, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Step 3: Upload the video file to api.video
    const form = new FormData();
    form.append('file', fs.createReadStream(outputVideo));

    await axios.post(`${BASE_URL}/videos/${videoId}/source`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    // Step 4: Save to DB
    await Media.findByIdAndUpdate(mediaId, {
      renderId: videoId,
      storyUrl: `https://embed.api.video/vod/${videoId}`,
      encodingStatus: 'processing',
      mediaType: 'video'
    });

    res.json({
      success: true,
      videoId,
      playbackUrl: `https://embed.api.video/vod/${videoId}`
    });

    // Optional: delete the temp video file
    fs.unlink(outputVideo, () => {});
  } catch (err) {
    console.error('❌ Video generation error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};


export const checkApiVideoStatus = async (req, res) => {
  const { videoId } = req.params;

  try {
    const response = await axios.get(`${BASE_URL}/videos/${videoId}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });

    const video = response.data;
    res.json({
      status: video.encoding?.status,
      videoId: video.videoId,
      title: video.title,
      playbackUrl: video.assets?.player
    });
  } catch (error) {
    console.error("❌ Error checking video status:", error.message);
    res.status(500).json({ error: "Failed to fetch video status" });
  }
};
