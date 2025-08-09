import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import Token from '../models/Token.js';

// Step 1: Write credentials JSON to disk if needed (Render / local)
if (process.env.YOUTUBE_CREDS_JSON && !process.env.YOUTUBE_APPLICATION_CREDENTIALS) {
  const credsPath = process.env.NODE_ENV === 'production'
    ? '/tmp/youtube-creds.json' // writable temp folder on Render
    : path.resolve('./youtube-creds.json');

  fs.writeFileSync(credsPath, process.env.YOUTUBE_CREDS_JSON);
  process.env.YOUTUBE_APPLICATION_CREDENTIALS = credsPath;
}

// Dynamic redirect URI based on environment
const redirectUri = process.env.NODE_ENV === 'production'
  ? 'https://footage-to-reel.onrender.com/oauth2callback'
  : 'http://localhost:8080/oauth2callback';

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  redirectUri
);

// Scopes required for uploading to YouTube
const scopes = ['https://www.googleapis.com/auth/youtube.upload'];

// Generate YouTube OAuth consent URL
export const getAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // ensures refresh token is returned every time
  });
};

// Exchange OAuth code for tokens & save them
export const getTokens = async (code, userId) => {
  const { tokens } = await oauth2Client.getToken(code);
  await Token.findOneAndUpdate(
    { userId },
    tokens,
    { upsert: true, new: true }
  );
  return tokens;
};

// Load tokens from DB and set on OAuth client
export const setCredentialsFromDB = async (userId) => {
  const tokens = await Token.findOne({ userId });
  if (!tokens) throw new Error('No tokens found for user');
  oauth2Client.setCredentials(tokens);
};

// Listen for token refresh and save new tokens to DB
oauth2Client.on('tokens', async (tokens) => {
  try {
    if (!tokens) return;
    if (!tokens.refresh_token && !tokens.access_token) return;

    const userId = oauth2Client.userIdForTokenSave;
    

    if (!userId) return;

    const existingTokens = await Token.findOne({ userId });
    if (!existingTokens) return;

    const updatedTokens = {
      ...existingTokens.toObject(),
      ...tokens,
    };

    await Token.findOneAndUpdate({ userId }, updatedTokens);
  } catch (err) {
    console.error('Error saving refreshed tokens:', err);
  }
});


// Upload video
export const uploadVideo = async (userId, videoPath, title, description) => {
  await setCredentialsFromDB(userId);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags: ['example', 'video'],
        categoryId: '22',
      },
      status: {
        privacyStatus: 'public',
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  return response.data;
};