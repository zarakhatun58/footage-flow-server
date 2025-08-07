import fs from 'fs';
import path from 'path';
import Media from '../models/Media.js';
import { apiVideo } from '@api.video/nodejs-sdk';

const { ApiVideoClient } = apiVideo;

const client = new ApiVideoClient({
  apiKey: process.env.API_VIDEO_KEY || 'hXtdT5GTosaAcM7lNMmhasVRO75GRlZ62oo7U6i8yZ'
});

export const generateApiVideo = async (req, res) => {
  const { imageName, audioName, mediaId } = req.body;

  if (!imageName || !audioName || !mediaId) {
    return res.status(400).json({ success: false, error: 'Missing image, audio, or mediaId' });
  }

  const imagePath = path.join('uploads', path.basename(imageName));
  const audioPath = path.join('uploads/audio', path.basename(audioName));

  try {
    const video = await client.videos.create({ title: 'Generated Video' });

    const tempOutput = `uploads/temp-${Date.now()}.mp4`;
    const ffmpegCommand = `ffmpeg -loop 1 -i ${imagePath} -i ${audioPath} -c:v libx264 -tune stillimage -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -y ${tempOutput}`;

    await new Promise((resolve, reject) => {
      require('child_process').exec(ffmpegCommand, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const fileStream = fs.createReadStream(tempOutput);
    await client.videos.upload(video.videoId, fileStream);

    await Media.findByIdAndUpdate(mediaId, {
      renderId: video.videoId,
      storyUrl: video.assets?.player || '',
      encodingStatus: 'processing',
      mediaType: 'video'
    });

    res.json({
      success: true,
      videoId: video.videoId,
      playbackUrl: video.assets?.player
    });

    fs.unlink(tempOutput, () => {});
  } catch (err) {
    console.error('❌ API.video error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const checkApiVideoStatus = async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    return res.status(400).json({ success: false, error: 'Missing video ID' });
  }

  try {
    const video = await client.videos.get(videoId);
    const status = video?.encoding?.status || 'unknown';
    const isReady = status === 'ready';

    if (isReady) {
      await Media.findOneAndUpdate(
        { renderId: videoId },
        { encodingStatus: 'completed', storyUrl: video.assets?.player }
      );
    }

    return res.status(200).json({
      success: true,
      status,
      playbackUrl: isReady ? video.assets?.player : null
    });
  } catch (err) {
    console.error('❌ Error checking video status:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch video status' });
  }
};
