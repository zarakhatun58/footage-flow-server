import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs/promises';
import path from 'path';

if (process.env.GOOGLE_CREDS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const credsPath = path.resolve('./config/google-creds.json');
  fs.writeFileSync(credsPath, process.env.GOOGLE_CREDS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
}

const client = new textToSpeech.TextToSpeechClient();

/**
 * Generates voice-over MP3 file from given text.
 * @param {string} text - Text to convert to speech.
 * @param {string} outputFile - (Optional) File name for the output MP3.
 * @returns {Promise<string>} - Path to the generated MP3 file.
 */
export async function generateVoiceOver(text, outputFile = 'output.mp3') {
  const request = {
    input: { text },
    voice: { languageCode: 'en-US', ssmlGender: 'FEMALE' },
    audioConfig: { audioEncoding: 'MP3' },
  };

  const [response] = await client.synthesizeSpeech(request);
  const outputPath = path.join('uploads', outputFile);
  await fs.writeFile(outputPath, response.audioContent, 'binary');

  const publicUrl = `${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}/uploads/${outputFile}`;
  console.log('✅ Voice-over created at:', publicUrl);
  return publicUrl;
}

