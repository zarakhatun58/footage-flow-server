import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import Media from '../models/Media.js';

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
    // Step 1: Create video container
    const createVideoRes = await axios.post(`${BASE_URL}/videos`, {
      title: 'Generated Video',
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const videoId = createVideoRes.data.videoId;

    // Step 2: Use ffmpeg to generate .mp4
    const ffmpegCmd = `ffmpeg -loop 1 -i ${imagePath} -i ${audioPath} -c:v libx264 -tune stillimage -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -y ${outputVideo}`;

    await new Promise((resolve, reject) => {
      require('child_process').exec(ffmpegCmd, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Step 3: Upload .mp4
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

    fs.unlink(outputVideo, () => {});
  } catch (err) {
    console.error('❌ Video generation error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const checkApiVideoStatus = async (req, res) => {
  const { videoId } = req.params;

  try {
    const video = await client.videos.get(videoId);
    return res.json({
      status: video.encoding.status,
      videoId: video.videoId,
      title: video.title,
      asset: video.assets,
    });
  } catch (error) {
    console.error("Error checking video status:", error);
    return res.status(500).json({ error: "Failed to fetch video status" });
  }
};