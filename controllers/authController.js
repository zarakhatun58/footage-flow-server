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

// helper to refresh tokens
export const refreshGoogleAccessToken = async (user) => {
  if (!user.googleRefreshToken) return null;

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
    if (!access_token) return null;

    // ✅ Preserve old scopes if Google doesn't send any
    let newScopes = Array.isArray(user.grantedScopes) ? [...user.grantedScopes] : [];

    if (scope) {
      const refreshedScopes = scope.split(" ");
      newScopes = Array.from(new Set([...newScopes, ...refreshedScopes]));
    }

    user.googleAccessToken = access_token;
    user.grantedScopes = newScopes;
    await user.save();

    return access_token;
  } catch (err) {
    console.error(
      "Failed to refresh Google access token:",
      err.response?.data || err.message
    );
    return null;
  }
};

// loginWithGoogle.js
export const loginWithGoogle = async (req, res) => {
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

    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // ✅ include scope here
    const { id_token, access_token, refresh_token, scope } = tokenRes.data;
    const grantedScopes = scope?.split(" ") || [];

    // Verify ID token
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) return res.status(400).json({ error: "Invalid Google token" });

    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await reelUser.findOne({ email });
    if (!user) {
      user = await reelUser.create({
        googleId,
        email,
        username: name,
        profilePic: picture,
      });
    } else if (!user.googleId) {
      user.googleId = googleId;
    }

    // ✅ Always update tokens + granted scopes
    user.googleAccessToken = access_token;
    if (refresh_token) user.googleRefreshToken = refresh_token;
    if (grantedScopes.length) user.grantedScopes = grantedScopes;

    await user.save();

    const appToken = signToken(user);

    return res.json({
      token: appToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
      },
    });
  } catch (err) {
    console.error("Google login error:", err.response?.data || err.message);
    return res.status(401).json({ error: "Google login failed" });
  }
};

// googleCallback.js
export const googleCallback = async (req, res) => {
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

    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { id_token, access_token, refresh_token, scope } = tokenRes.data;
    const grantedScopes = scope?.split(" ") || [];

    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    let user = await reelUser.findOne({ email });
    if (!user) {
      user = await reelUser.create({ googleId, email, username: name, profilePic: picture });
    } else if (!user.googleId) {
      user.googleId = googleId;
    }

    // Update tokens and granted scopes
    user.googleAccessToken = access_token;
    if (refresh_token) user.googleRefreshToken = refresh_token;
    user.grantedScopes = grantedScopes;

    await user.save();

    const appToken = signToken(user);
    const FRONTEND_URL = process.env.FRONTEND_URL;

    res.redirect(
      `${FRONTEND_URL}/auth/callback?token=${appToken}&email=${email}&username=${name}&profilePic=${picture}`
    );
  } catch (err) {
    console.error("Google callback error:", err.response?.data || err.message);
    res.status(500).send("Google callback failed");
  }
};

export const getGooglePhotos = async (req, res) => {
  try {
    const user = await reelUser.findById(req.userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";

    // Google Photos API call helper
    const fetchPhotos = async (accessToken) => {
      return axios.get("https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=20", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    };

    let token = user.googleAccessToken;
    let hasPhotosScope = Array.isArray(user.grantedScopes) && user.grantedScopes.includes(PHOTOS_SCOPE);

    // ⚡ Ensure token and scope
    if (!token || !hasPhotosScope) {
      if (!user.googleRefreshToken) {
        return res.status(403).json({ error: "No valid tokens. User consent required." });
      }

      // Refresh token
      token = await refreshGoogleAccessToken(user);

      // Double-check scope persistence
      hasPhotosScope = Array.isArray(user.grantedScopes) && user.grantedScopes.includes(PHOTOS_SCOPE);

      if (!token || !hasPhotosScope) {
        return res.status(403).json({ error: "Access token missing Google Photos scope." });
      }
    }

    try {
      const photosRes = await fetchPhotos(token);
      return res.json(photosRes.data);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        // 🔁 Retry once after refresh
        token = await refreshGoogleAccessToken(user);
        hasPhotosScope = Array.isArray(user.grantedScopes) && user.grantedScopes.includes(PHOTOS_SCOPE);

        if (!token || !hasPhotosScope) {
          return res.status(403).json({ error: "Google Photos access still denied after refresh." });
        }

        const retryRes = await fetchPhotos(token);
        return res.json(retryRes.data);
      }

      console.error("Google Photos API error:", err.response?.data || err.message);
      return res.status(status || 500).json({ error: err.response?.data || err.message });
    }
  } catch (err) {
    console.error("getGooglePhotos error:", err.message);
    return res.status(500).json({ error: err.message || "Failed to fetch photos" });
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
