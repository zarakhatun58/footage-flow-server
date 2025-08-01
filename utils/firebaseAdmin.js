import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';


// Parse the JSON string from env
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);

// Fix escaped newline in private_key
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

