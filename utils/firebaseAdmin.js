import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

// Resolve the path to absolute
const configPath = path.resolve(process.env.FIREBASE_CONFIG_JSON);
const serviceAccount = JSON.parse(readFileSync(configPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const verifyIdToken = async (idToken) => {
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    return null;
  }
};
