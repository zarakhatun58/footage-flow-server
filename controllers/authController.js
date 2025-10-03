import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import reelUser from '../models/User.js';
import { sendEmail } from '../utils/sendEmail.js';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper: sign JWT with consistent payload
const signToken = (user) => {
   console.log("[signToken] Signing JWT for user:", user._id);
  return jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
};

export const register = async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const existing = await reelUser.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    if (!username || username.trim() === '') {
      username = email.split('@')[0] + Math.floor(Math.random() * 1000);
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await reelUser.create({ username, email, password: hashed });

    const token = signToken(user);

    res.status(201).json({
      user: { id: user._id, username: user.username, email: user.email, profilePic: user.profilePic || null },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await reelUser.findOne({ email });
    if (!user || !user.password) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    const token = signToken(user);

    res.json({ token, user: { id: user._id, username: user.username, email: user.email, profilePic: user.profilePic || null } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
};


// Refresh Google access token
export const refreshGoogleAccessToken = async (user) => {
  console.log("[refreshGoogleAccessToken] User:", user._id);
  if (!user.googleRefreshToken) {
    console.log("[refreshGoogleAccessToken] No refresh token");
    return null;
  }

  try {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: user.googleRefreshToken,
      grant_type: "refresh_token",
    });

    const res = await axios.post(
      "https://oauth2.googleapis.com/token",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, scope } = res.data;
    console.log("[refreshGoogleAccessToken] New access token received:", access_token ? "Yes" : "No");

    if (!access_token) return null;

    let newScopes = Array.isArray(user.grantedScopes) ? [...user.grantedScopes] : [];
    if (scope) {
      const refreshedScopes = scope.split(" ");
      newScopes = Array.from(new Set([...newScopes, ...refreshedScopes]));
      console.log("[refreshGoogleAccessToken] Updated scopes:", newScopes);
    }

    user.googleAccessToken = access_token;
    user.grantedScopes = newScopes;
    await user.save();
    console.log("[refreshGoogleAccessToken] User updated in DB");

    return access_token;
  } catch (err) {
    console.error("[refreshGoogleAccessToken] Error:", err.response?.data || err.message);
    return null;
  }
};

// Get token info
const getTokenInfo = async (accessToken) => {
  if (!accessToken) return null;
  try {
    console.log("[getTokenInfo] Checking token:", accessToken);
    const infoRes = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    console.log("[getTokenInfo] Token info:", infoRes.data);
    return infoRes.data;
  } catch (err) {
    console.error("[getTokenInfo] Failed:", err.response?.data || err.message);
    return null;
  }
};

// Debug endpoint for token info
export const googleTokenInfo = async (req, res) => {
  console.log("[googleTokenInfo] Called for userId:", req.userId);
  try {
    const user = await reelUser.findById(req.userId);
    if (!user) {
      console.log("[googleTokenInfo] User not found");
      return res.status(401).json({ error: "User not found" });
    }

    const tokenInfo = await getTokenInfo(user.googleAccessToken);
    res.json({
      dbScopes: user.grantedScopes || [],
      tokenScopes: tokenInfo?.scope || null,
      tokenInfo,
    });
  } catch (err) {
    console.error("[googleTokenInfo] Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch token info" });
  }
};


export const loginWithGoogle = async (req, res) => {
  console.log("[loginWithGoogle] Body:", req.body);
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Authorization code required" });

  try {
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("[loginWithGoogle] Token response:", tokenRes.data);

    const { id_token, access_token, refresh_token, scope } = tokenRes.data;
    const grantedScopes = scope?.split(" ") || [];

    const ticket = await client.verifyIdToken({ idToken: id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    console.log("[loginWithGoogle] Google payload:", payload);

    let user = await reelUser.findOne({ email });
    if (!user) {
      console.log("[loginWithGoogle] Creating new user");
      user = await reelUser.create({ googleId, email, username: name, profilePic: picture });
    } else if (!user.googleId) {
      console.log("[loginWithGoogle] Linking Google ID");
      user.googleId = googleId;
    }

    user.googleAccessToken = access_token;
    if (refresh_token) user.googleRefreshToken = refresh_token;
    user.grantedScopes = Array.from(new Set([...(user.grantedScopes || []), ...grantedScopes]));

    await user.save();
    console.log("[loginWithGoogle] User saved:", user._id);

    const appToken = signToken(user);
    res.json({ token: appToken, user: { id: user._id, username: user.username, email: user.email, profilePic: user.profilePic } });
  } catch (err) {
    console.error("[loginWithGoogle] Error:", err.response?.data || err.message);
    res.status(401).json({ error: "Google login failed" });
  }
};

// Google callback
export const googleCallback = async (req, res) => {
  console.log("[googleCallback] Query:", req.query);
  const { code } = req.query;
  if (!code) return res.status(400).send("No code provided");

  try {
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("[googleCallback] Token response:", tokenRes.data);

    const { id_token, access_token, refresh_token, scope } = tokenRes.data;
    const grantedScopes = scope?.split(" ") || [];

    const ticket = await client.verifyIdToken({ idToken: id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;
    console.log("[googleCallback] Payload:", payload);

    let user = await reelUser.findOne({ email });
    if (!user) {
      console.log("[googleCallback] Creating new user");
      user = await reelUser.create({ googleId, email, username: name, profilePic: picture });
    } else if (!user.googleId) {
      console.log("[googleCallback] Linking Google ID");
      user.googleId = googleId;
    }

    user.googleAccessToken = access_token;
    if (refresh_token) user.googleRefreshToken = refresh_token;
    user.grantedScopes = Array.from(new Set([...(user.grantedScopes || []), ...grantedScopes]));

    await user.save();
    console.log("[googleCallback] User saved:", user._id);

    const appToken = signToken(user);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${appToken}&email=${email}&username=${name}&profilePic=${picture}`);
  } catch (err) {
    console.error("[googleCallback] Error:", err.response?.data || err.message);
    res.status(500).send("Google callback failed");
  }
};

// Get Google Photos
export const getGooglePhotos = async (req, res) => {
  console.log("[getGooglePhotos] userId:", req.userId);
  try {
    const user = await reelUser.findById(req.userId);
    if (!user) {
      console.log("[getGooglePhotos] User not found");
      return res.status(401).json({ error: "User not found" });
    }

    const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";

    if (!user.googleAccessToken || !user.grantedScopes.includes(PHOTOS_SCOPE)) {
      console.log("[getGooglePhotos] Insufficient scopes:", user.grantedScopes);
      return res.status(403).json({ error: "Request had insufficient authentication scopes." });
    }

    const photosRes = await axios.get("https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=20", {
      headers: { Authorization: `Bearer ${user.googleAccessToken}` },
    });
    console.log("[getGooglePhotos] Photos fetched:", photosRes.data.mediaItems?.length || 0);

    res.json(photosRes.data);
  } catch (err) {
    console.error("[getGooglePhotos] Error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.message || "Failed to fetch photos" });
  }
};

// Request photos scope
export const requestPhotosScope = async (req, res) => {
  console.log("[requestPhotosScope] userId:", req.userId);
  try {
    const user = await reelUser.findById(req.userId);
    if (!user) {
      console.log("[requestPhotosScope] User not found");
      return res.status(401).json({ error: "User not found" });
    }

    const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI + "/photos-callback")}&response_type=code&scope=${encodeURIComponent(PHOTOS_SCOPE)}&access_type=offline&prompt=consent&state=${user._id}`;

    console.log("[requestPhotosScope] OAuth URL:", oauthUrl);
    res.json({ url: oauthUrl });
  } catch (err) {
    console.error("[requestPhotosScope] Error:", err.message);
    res.status(500).json({ error: "Failed to build photos scope URL" });
  }
};

// Photos callback
export const photosCallback = async (req, res) => {
  console.log("[photosCallback] Query:", req.query);
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send("Missing code or user ID");

  try {
    const user = await reelUser.findById(userId);
    if (!user) {
      console.log("[photosCallback] User not found");
      return res.status(401).json({ error: "User not found" });
    }

    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.GOOGLE_REDIRECT_URI}/photos-callback`,
      grant_type: "authorization_code",
    });

    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("[photosCallback] Token response:", tokenRes.data);

    const { access_token, refresh_token, scope } = tokenRes.data;
    const newScopes = scope?.split(" ") || [];

    user.googleAccessToken = access_token;
    if (refresh_token) user.googleRefreshToken = refresh_token;
    user.grantedScopes = Array.from(new Set([...(user.grantedScopes || []), ...newScopes]));

    await user.save();
    console.log("[photosCallback] User saved with new scopes:", user.grantedScopes);

    const appToken = signToken(user);
    res.redirect(`${process.env.FRONTEND_URL}/gallery?token=${appToken}`);
  } catch (err) {
    console.error("[photosCallback] Error:", err.response?.data || err.message);
    res.status(500).send("Failed to grant Google Photos access");
  }
};





export const getProfile = async (req, res) => {
  try {
    const user = await reelUser.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        googleAccessToken: user.googleAccessToken || null, // optional
      },
    });
  } catch (err) {
    console.error("getProfile error:", err.message);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
};

// export const loginWithGoogle = async (req, res) => {
//   const { idToken, accessToken } = req.body;  

//   try {
//     const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
//     const payload = ticket.getPayload();
//     if (!payload) return res.status(400).json({ error: 'Invalid Google token' });

//     const { sub: googleId, email, name, picture } = payload;

//     let user = await reelUser.findOne({ email });
//     if (!user) {
//       user = await reelUser.create({ googleId, email, username: name, profilePic: picture });
//     }

//     // ⬇️ CHANGE 3: store accessToken for Google Photos API
//     if (accessToken) {
//       user.googleAccessToken = accessToken;
//       await user.save();
//     }

//     const appToken = signToken(user);

//     res.json({
//       token: appToken,
//       user: { id: user._id, username: user.username, email: user.email, profilePic: user.profilePic },
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(401).json({ error: 'Google login failed' });
//   }
// };




export const logout = (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
  res.json({ message: 'Logged out successfully' });
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await reelUser.findOne({ email });
    if (!user) return res.status(404).json({ error: 'Email not found' });

    const resetToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '15m' });
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const html = `<h3>Password Reset</h3><p>Click the link to reset password:</p><a href="${resetLink}">${resetLink}</a>`;
    await sendEmail(user.email, 'Reset Password', html);

    res.json({ message: 'Reset email sent', resetToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error generating reset token' });
  }
};

export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await reelUser.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'Invalid token' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Token invalid or expired' });
  }
};
