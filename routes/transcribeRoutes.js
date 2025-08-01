import express from 'express';
import { transcribeAndAnalyze } from '../controllers/transcribeController.js';

const router = express.Router();

// POST /api/transcribe
router.post('/transcribe', transcribeAndAnalyze);

export default router;
