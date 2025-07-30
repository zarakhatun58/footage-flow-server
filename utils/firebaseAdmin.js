// utils/firebaseAdmin.js
import { admin } from 'firebase-admin';
// import serviceAccount from '../firebase-service-account.json' with { type: "json" };
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export const verifyIdToken = async (idToken) => {
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    return null;
  }
};


// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// const firebaseConfig = {
//   apiKey: "AIzaSyCsb-0asPnrJywfdzC2kU6B78k9VgUzsvI",
//   authDomain: "footage-flow-8247f.firebaseapp.com",
//   projectId: "footage-flow-8247f",
//   storageBucket: "footage-flow-8247f.firebasestorage.app",
//   messagingSenderId: "239089706267",
//   appId: "1:239089706267:web:73f3ccdb73ed4527ef9fbe"
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);