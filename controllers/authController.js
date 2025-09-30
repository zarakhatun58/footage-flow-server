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

// Google login controller
export const loginWithGoogle = async (req, res) => {
  const { code } = req.body;
  console.log("Step 0: Received code from frontend:", code);

  if (!code) {
    console.log("Step 0: No authorization code provided");
    return res.status(400).json({ error: "Authorization code required" });
  }

  try {
    // 1️⃣ Exchange code for tokens
    console.log("Step 1: Exchanging code for tokens...");
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      null,
      {
        params: {
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { id_token, access_token, refresh_token } = tokenRes.data;
    console.log("Step 1: Tokens received:", { id_token, access_token, refresh_token });

    // 2️⃣ Verify Google ID token
    console.log("Step 2: Verifying ID token...");
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      console.log("Step 2: Invalid Google token");
      return res.status(400).json({ error: "Invalid Google token" });
    }

    const { sub: googleId, email, name, picture } = payload;
    console.log("Step 2: Payload verified:", { googleId, email, name, picture });

    // 3️⃣ Find or create user
    console.log("Step 3: Finding or creating user in DB...");
    let user = await reelUser.findOne({ email });
    if (!user) {
      console.log("Step 3: User not found, creating new user...");
      user = await reelUser.create({ googleId, email, username: name, profilePic: picture });
    } else {
      console.log("Step 3: User found:", user.email);
    }

    // 4️⃣ Save Google tokens
    console.log("Step 4: Saving Google tokens...");
    user.googleAccessToken = access_token;
    if (refresh_token) {
      user.googleRefreshToken = refresh_token;
      console.log("Step 4: Refresh token saved");
    }
    await user.save();

    // 5️⃣ Issue app JWT
    console.log("Step 5: Signing JWT token for app...");
    const appToken = signToken(user);

    // ✅ Response
    console.log("Step 6: Sending response with token and user info");
    res.json({
      token: appToken,
      user: { id: user._id, username: user.username, email: user.email, profilePic: user.profilePic },
    });
  } catch (err) {
    console.error("Step X: Google login error:", err.response?.data || err.message);
    res.status(401).json({ error: "Google login failed" });
  }
};

// Callback controller for OAuth redirect flow
export const googleCallback = async (req, res) => {
  const { code } = req.query;
  console.log("Callback: Received code:", code);
  if (!code) return res.status(400).send("No code provided");

  try {
    // Reuse loginWithGoogle logic
    const fakeReq = { body: { code } };
    let jsonData;

    const fakeRes = {
      json: (data) => {
        jsonData = data;
        console.log("Callback: loginWithGoogle response:", data);
      },
      status: (s) => ({
        json: (data) => {
          jsonData = { ...data, status: s };
          console.log(`Callback: status ${s}`, data);
        },
      }),
    };

    await loginWithGoogle(fakeReq, fakeRes);

    if (!jsonData?.token) throw new Error("Google login failed");

    const FRONTEND_URL = process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com";

    console.log("Callback: Redirecting to frontend with token and user info");
    res.redirect(
      `${FRONTEND_URL}/auth/callback?token=${jsonData.token}&email=${encodeURIComponent(
        jsonData.user.email
      )}&username=${encodeURIComponent(
        jsonData.user.username
      )}&profilePic=${encodeURIComponent(jsonData.user.profilePic || "")}`
    );
  } catch (err) {
    console.error("Callback: Google callback error:", err.message);
    res.status(500).send("Google callback failed");
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

export const getGooglePhotos = async (req, res) => {
  try {
    const user = await reelUser.findById(req.userId);
    if (!user?.googleAccessToken) {
      return res.status(401).json({ error: "No Google Photos access" });
    }

    const photosRes = await axios.get(
      "https://photoslibrary.googleapis.com/v1/mediaItems",
      {
        headers: { Authorization: `Bearer ${user.googleAccessToken}` },
      }
    );

    res.json(photosRes.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch photos" });
  }
};


export const getProfile = async (req, res) => {
  try {
    const user = await reelUser.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Consistent with other endpoints:
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};


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
