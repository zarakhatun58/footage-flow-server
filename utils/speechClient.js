// utils/speechClient.js
import fs from 'fs';
import path from 'path';
import speech from '@google-cloud/speech';

// ✅ Step 1: Write credentials JSON to disk if needed
if (process.env.GOOGLE_CREDS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const credsPath = path.resolve('./google-creds.json');
  fs.writeFileSync(credsPath, process.env.GOOGLE_CREDS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
}

// ✅ Step 2: Initialize the Speech-to-Text client
const speechClient = new speech.SpeechClient();

export default speechClient;
