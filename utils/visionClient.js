// utils/visionClient.js
import fs from 'fs';
import path from 'path';
import vision from '@google-cloud/vision';

// ✅ Step 1: Create credentials file at runtime from env
if (process.env.GOOGLE_CREDS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const credsPath = process.env.NODE_ENV === 'production'
    ? '/tmp/google-creds.json' // ✅ Writable on Render
    : path.resolve('./config/google-creds.json');

  fs.writeFileSync(credsPath, process.env.GOOGLE_CREDS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
}


// ✅ Step 2: Initialize Vision API client
const visionClient = new vision.ImageAnnotatorClient();

export default visionClient;
