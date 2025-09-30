import express from 'express';
import { register, login, getProfile, logout, forgotPassword, resetPassword,loginWithGoogle, getGooglePhotos} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, getProfile);
router.post('/logout', logout);
router.post('/googleLogin', loginWithGoogle);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/google-photos', protect, getGooglePhotos);
router.get("/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: "No code in callback" });
  }

  try {
    // Reuse your loginWithGoogle logic by faking req/res
    const mockReq = { body: { code } };
    const mockRes = {
      status: (s) => ({ json: (d) => res.status(s).json(d) }),
      json: (d) => res.json(d),
    };

    await loginWithGoogle(mockReq, mockRes);
  } catch (err) {
    console.error("Google callback error:", err.message);
    res.status(500).json({ error: "Google callback failed" });
  }
});



export default router;
