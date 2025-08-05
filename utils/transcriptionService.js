// /services/transcriptionService.js
import speech from '@google-cloud/speech';
import fs from 'fs';
import path from 'path'; // ✅ Needed

// ✅ Set credentials path dynamically for Render
if (process.env.GOOGLE_CREDS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const credsPath = process.env.NODE_ENV === 'production'
    ? '/tmp/google-creds.json'
    : path.resolve('./config/google-creds.json');

  fs.writeFileSync(credsPath, process.env.GOOGLE_CREDS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
}

const client = new speech.SpeechClient();

/**
 * Transcribes a local MP3 or WAV audio file.
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<string>} - Transcript text
 */
export async function transcribeAudio(audioPath) {
  const fileBytes = fs.readFileSync(audioPath);
  const audioBytes = fileBytes.toString('base64');

  const audio = { content: audioBytes };
  const config = {
    encoding: 'MP3', // Or 'LINEAR16' for WAV
    languageCode: 'en-US',
  };

  const request = { audio, config };
  const [response] = await client.recognize(request);

  const transcript = response.results
    .map(result => result.alternatives[0].transcript)
    .join(' ');

  return transcript;
}
