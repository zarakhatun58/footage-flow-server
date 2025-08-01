import express from 'express';
import { getAllFiles } from '../controllers/fileController.js';

const router = express.Router();

router.get('/files', getAllFiles); // ✅ Main API

export default router;
