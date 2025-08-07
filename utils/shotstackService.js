import axios from 'axios';
import path from 'path';

const SHOTSTACK_API_URL = 'https://api.shotstack.io/v1/render';
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY;

/**
 * Create a video using multiple images and a voice-over.
 * @param {string[]} imagePaths - Local image paths.
 * @param {string} audioPath - Local audio path (MP3).
 * @param {number} durationPerImage - Duration in seconds per image.
 * @returns {Promise<string>} - Shotstack render ID.
 */
export async function createVideoWithVoice(imagePaths, audioPath, durationPerImage = 2) {
  const imageClips = imagePaths.map((localPath, index) => ({
    asset: {
      type: 'image',
      src: `${process.env.FRONTEND_URL}/uploads/${path.basename(localPath)}`
    },
    start: index * durationPerImage,
    length: durationPerImage,
    transition: {
      in: 'fade',
      out: 'fade'
    },
    effect: 'zoomIn'
  }));

  const audioClip = {
    asset: {
      type: 'audio',
      src: `${process.env.FRONTEND_URL}/uploads/${path.basename(audioPath)}`
    },
    start: 0,
    length: imagePaths.length * durationPerImage
  };

  const renderPayload = {
    timeline: {
      background: '#000000',
      tracks: [
        { clips: imageClips },
        { clips: [audioClip] }
      ]
    },
    output: {
      format: 'mp4',
      resolution: 'sd'
    }
  };

  try {
    const response = await axios.post(SHOTSTACK_API_URL, renderPayload, {
      headers: {
        'x-api-key': SHOTSTACK_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const renderId = response.data.response?.id;
    if (!renderId) {
      console.error('❌ No render ID returned:', response.data);
      throw new Error('Shotstack did not return a render ID');
    }

    return renderId;
  } catch (error) {
    console.error('❌ Shotstack error:', error.response?.data || error.message);
    throw error;
  }
}
