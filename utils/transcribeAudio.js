
import speech from '@google-cloud/speech';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import speechClient from './speechClient.js';

dotenv.config();


export const transcribeAudio = async (filePath) => {
  const wavPath = await convertToLinear16(filePath); // 🔁 Convert

  const fileBytes = fs.readFileSync(wavPath);
  const audioBytes = fileBytes.toString('base64');

  const request = {
    audio: { content: audioBytes },
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US'
    }
  };

  const [response] = await speechClient.recognize(request);

  // 🧹 Optional: delete temp file
  fs.unlink(wavPath, () => {});

  const transcript = response.results.map(r => r.alternatives[0].transcript).join(' ');
  return transcript.trim();
};
