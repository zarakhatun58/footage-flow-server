import express from 'express';
import {
    register, login, getProfile, logout, forgotPassword,
    resetPassword, loginWithGoogle, getGooglePhotos, requestPhotosScope,
    googleCallback, photosCallback, googleTokenInfo,refreshGoogleAccessToken
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, getProfile);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
// --- Google Login & Photos ---
router.post("/googleLogin", loginWithGoogle);
router.get("/google/callback", googleCallback);
router.get("/google-token-info", protect, googleTokenInfo);
router.get("/google-photos", protect, getGooglePhotos);
router.get("/google-photos-scope", protect, requestPhotosScope);
router.get("/photos-callback", photosCallback);

// --- Refresh Google Access Token ---
router.post("/refresh-token", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "User not found" });

    const newToken = await refreshGoogleAccessToken(user);
    if (!newToken)
      return res
        .status(403)
        .json({ error: "Failed to refresh token. Re-login required." });

    res.json({ accessToken: newToken });
  } catch (err) {
    console.error("[refresh-token] Error:", err.message);
    res.status(500).json({ error: "Server error refreshing token" });
  }
});



export default router;
