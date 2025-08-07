// routes/videoRoutes.js
import express from 'express';
import { generateApiVideo ,checkApiVideoStatus} from '../controllers/videoController.js';

const router = express.Router();

router.post('/generate', generateApiVideo);
router.get('/status/:videoId', checkApiVideoStatus);

export default router;
