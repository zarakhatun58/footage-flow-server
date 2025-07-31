// /routes/shotstackRoutes.js
import express from 'express';
import { generateVideoWithShotstack } from '../controllers/shotstackController.js';

const router = express.Router();

router.post('/generate-video', generateVideoWithShotstack);

export default router;
