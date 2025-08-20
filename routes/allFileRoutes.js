// routes/files.js
import express from 'express';

import { FileUpload, getFiles } from '../controllers/allFileController.js';
import { upload } from '../middleware/upload.middleware.js';


const router = express.Router();

router.get('/', getFiles);
router.post('/upload',  upload.array('files', 10), FileUpload);

export default router;
