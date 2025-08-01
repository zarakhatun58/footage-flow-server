
import speech from '@google-cloud/speech';
import path from 'path';
import dotenv from 'dotenv';
import speechClient from './speechClient.js';

dotenv.config();

export const transcribeAudio = async (filePath) => {
  const fileBytes = fs.readFileSync(filePath);
  const audioBytes = fileBytes.toString('base64');

  const request = {
    audio: { content: audioBytes },
    config: {
      encoding: 'LINEAR16', // or 'MP3', 'WEBM_OPUS' depending on input
      sampleRateHertz: 16000,
      languageCode: 'en-US'
    }
  };

  const [response] = await speechClient.recognize(request);
  const transcript = response.results.map(r => r.alternatives[0].transcript).join(' ');
  return transcript.trim();
};