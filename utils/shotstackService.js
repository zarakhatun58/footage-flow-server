import axios from 'axios';

const SHOTSTACK_API_URL = 'https://api.shotstack.io/v1/render';
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY;

/**
 * Create a video using an image and voice-over.
 * @param {string} imageUrl - Public URL of the image.
 * @param {string} audioUrl - Public URL of the audio (MP3).
 * @returns {Promise<string>} - Shotstack render ID.
 */
export async function createVideoWithVoice(localImagePath, localAudioPath) {
  const imageUrl = `${process.env.FRONTEND_URL}/uploads/${path.basename(localImagePath)}`;
  const audioUrl = `${process.env.FRONTEND_URL}/uploads/${path.basename(localAudioPath)}`;

  const renderPayload = {
    timeline: {
      soundtrack: {
        src: audioUrl,
        effect: 'fadeInFadeOut'
      },
      tracks: [
        {
          clips: [
            {
              asset: {
                type: 'image',
                src: imageUrl
              },
              start: 0,
              length: 5,
              effect: 'zoomIn',
              transition: {
                in: 'fade',
                out: 'fade'
              }
            }
          ]
        }
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
