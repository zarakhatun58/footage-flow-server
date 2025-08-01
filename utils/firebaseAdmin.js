import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

// ✅ Resolve the path from the env
const configPath = path.resolve(process.env.FIREBASE_CONFIG_JSON);
const serviceAccount = JSON.parse(readFileSync(configPath, 'utf8'));

// ✅ Fix escaped newlines if needed
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

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

