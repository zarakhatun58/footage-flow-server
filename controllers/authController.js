import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import reelUser from '../models/User.js';
import { sendEmail } from '../utils/sendEmail.js';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Helper: sign JWT with consistent payload
const signToken = (user) => {
  console.log("[signToken] Signing JWT for user:", user._id);
  return jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
};




// Refresh Google access token
// Refresh Google access token (ensures Photos scope)
export const refreshGoogleAccessToken = async (user) => {
  if (!user.googleRefreshToken) return null;

  try {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: user.googleRefreshToken,
      grant_type: "refresh_token",
    });

    const res = await axios.post("https://oauth2.googleapis.com/token", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const { access_token } = res.data;
    if (!access_token) {
      console.warn("[refreshGoogleAccessToken] No access_token returned");
      return null;
    }

    // Verify scopes on the refreshed token
    const tokenInfo = await getTokenInfo(access_token);
    const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";
    const tokenScopesStr = tokenInfo?.scope || "";

    if (!tokenScopesStr.includes(PHOTOS_SCOPE)) {
      console.warn("[refreshGoogleAccessToken] Refreshed token missing Photos scope:", tokenScopesStr);
      // Remove invalid token so frontend triggers re-consent
      user.googleAccessToken = null;
      await user.save();
      return null;
    }

    // Save valid token
    user.googleAccessToken = access_token;
    await user.save();
    console.log("[refreshGoogleAccessToken] Updated user token:", user._id);

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
  console.log("[loginWithGoogle] Request body:", req.body);
  const { code } = req.body;
  if (!code) {
    console.log("[loginWithGoogle] No authorization code provided");
    return res.status(400).json({ error: "Authorization code required" });
  }

  try {
    // ✅ Step 1: Exchange code for tokens (include Photos scope)
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
    console.log("[loginWithGoogle] Granted scopes:", grantedScopes);

    // ✅ Step 2: Verify ID token
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    console.log("[loginWithGoogle] Google ID token payload:", payload);

    // ✅ Step 3: Find or create user
    let user = await reelUser.findOne({ email });
    if (!user) {
      console.log("[loginWithGoogle] Creating new user");
      user = await reelUser.create({
        googleId,
        email,
        username: name,
        profilePic: picture,
      });
    } else if (!user.googleId) {
      console.log("[loginWithGoogle] Linking Google ID to existing user");
      user.googleId = googleId;
    }

    // ✅ Step 4: Update tokens and include all required scopes (Photos access included)
    console.log("[loginWithGoogle] Updating user access and refresh tokens");
    user.googleAccessToken = access_token;
    if (refresh_token) user.googleRefreshToken = refresh_token;

    // ensure Photos scope is always saved even if not in returned list
    const allScopes = new Set([
      ...(user.grantedScopes || []),
      ...grantedScopes,
      "https://www.googleapis.com/auth/photoslibrary.readonly",
    ]);
    user.grantedScopes = Array.from(allScopes);

    await user.save();
    console.log("[loginWithGoogle] User saved successfully:", user._id);

    // ✅ Step 5: Sign JWT
    const appToken = signToken(user);
    console.log("[loginWithGoogle] App token signed:", appToken);

    // ✅ Step 6: Send success response
    res.json({
      token: appToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
      },
    });
  } catch (err) {
    console.error("[loginWithGoogle] Error during login:", err.response?.data || err.message);
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

    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { id_token, access_token, refresh_token, scope } = tokenRes.data;
    const grantedScopes = scope?.split(" ") || [];
    console.log("[googleCallback] Token response:", tokenRes.data);

    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

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
    // Redirect to frontend with token
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?token=${appToken}&email=${encodeURIComponent(email)}&username=${encodeURIComponent(name)}&profilePic=${encodeURIComponent(picture)}`
    );
  } catch (err) {
    console.error("[googleCallback] Error:", err.response?.data || err.message);
    return res.status(500).send("Google callback failed");
  }
};


// Request Photos scope
export const requestPhotosScope = async (req, res) => {
  try {
    const user = await reelUser.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";

    if (user.grantedScopes?.includes(PHOTOS_SCOPE)) {
      return res.json({
        grantedScopes: user.grantedScopes,
        hasPhotosScope: true,
      });
    }

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      process.env.GOOGLE_REDIRECT_URI + "/photos-callback"
    )}&response_type=code&scope=${encodeURIComponent(
      PHOTOS_SCOPE
    )}&access_type=offline&prompt=consent&state=${user._id}`;

    res.json({
      grantedScopes: user.grantedScopes || [],
      hasPhotosScope: false,
      url: oauthUrl,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to build Google Photos scope URL" });
  }
};


// Get Google Photos
export const getGooglePhotos = async (req, res) => {
  try {
    const user = await reelUser.findById(req.userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";

    // Step 1: Ensure Photos scope is granted
    if (!user.grantedScopes?.includes(PHOTOS_SCOPE)) {
      return res.status(403).json({
        error: "Google Photos access required. Please grant permission again.",
        needsScope: true,
      });
    }

    const fetchFromGoogle = async (token) => {
      const photosRes = await axios.get(
        "https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=20",
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", } }
      );
      return photosRes.data;
    };

    let accessToken = user.googleAccessToken;

    try {
      // Try fetching with current token
      const data = await fetchFromGoogle(accessToken);
      return res.json(data);
    } catch (err) {
      const status = err.response?.status;
      const errorMessage = err.response?.data?.error?.message || "";

      // Refresh token if expired or insufficient
      if ((status === 401 || (status === 403 && errorMessage.includes("insufficient"))) && user.googleRefreshToken) {
        const newAccessToken = await refreshGoogleAccessToken(user);

        if (!newAccessToken) {
          return res.status(403).json({
            error: "Session expired or Photos scope missing. Please grant access again.",
            needsScope: true,
          });
        }

        // Retry with refreshed token
        const data = await fetchFromGoogle(newAccessToken);
        return res.json(data);
      }

      console.error("[getGooglePhotos API error]:", err.response?.data || err.message);
      return res.status(500).json({ error: "Failed to fetch Google Photos" });
    }
  } catch (err) {
    console.error("[getGooglePhotos fatal error]:", err.message);
    return res.status(500).json({ error: "Server error fetching Google Photos" });
  }
};





// Photos callback
export const photosCallback = async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send("Missing code or user ID");

  try {
    const user = await reelUser.findById(userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    // Step 1: Exchange code for access and refresh tokens
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.GOOGLE_REDIRECT_URI}/photos-callback`,
      grant_type: "authorization_code",
    });

    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, scope } = tokenRes.data;

    // Step 2: Save tokens and scopes
    user.googleAccessToken = access_token;
    if (refresh_token) user.googleRefreshToken = refresh_token;
    user.grantedScopes = Array.from(
      new Set([...(user.grantedScopes || []), ...(scope?.split(" ") || [])])
    );

    await user.save();

    // Step 3: Ensure access token is valid (refresh if needed)
    const validAccessToken = await refreshGoogleAccessToken(user) || user.googleAccessToken;

    if (!validAccessToken) {
      return res.status(403).send("Session expired. Please log in again.");
    }

    // Step 4: Sign JWT and redirect frontend
    const appToken = signToken(user);
    res.redirect(`${process.env.FRONTEND_URL}/gallery?token=${appToken}`);
  } catch (err) {
    console.error("photosCallback error:", err.response?.data || err.message);
    res.status(500).send("Failed to grant Google Photos access");
  }
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

export const loginGoogle = async (req, res) => {
  const { idToken, accessToken } = req.body;

  try {
    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload) return res.status(400).json({ error: 'Invalid Google token' });

    const { sub: googleId, email, name, picture } = payload;

    let user = await reelUser.findOne({ email });
    if (!user) {
      user = await reelUser.create({ googleId, email, username: name, profilePic: picture });
    }

    // ⬇️ CHANGE 3: store accessToken for Google Photos API
    if (accessToken) {
      user.googleAccessToken = accessToken;
      await user.save();
    }

    const appToken = signToken(user);

    res.json({
      token: appToken,
      user: { id: user._id, username: user.username, email: user.email, profilePic: user.profilePic },
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Google login failed' });
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
