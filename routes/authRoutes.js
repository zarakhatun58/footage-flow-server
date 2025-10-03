import express from 'express';
import {
    register, login, getProfile, logout, forgotPassword,
    resetPassword, loginWithGoogle, getGooglePhotos, requestPhotosScope,
    googleCallback, photosCallback, googleTokenInfo
} from '../controllers/authController.js';
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
// GET /api/auth/google/callback
router.get("/google/callback", googleCallback);
router.get("/google-photos-scope",protect, requestPhotosScope);
router.get("/photos-callback", photosCallback);
router.get("/google-token-info", protect, googleTokenInfo);




export default router;
