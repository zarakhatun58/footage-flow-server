// routes/engagementRoutes.js
import express from "express";
import {
  getMediaById,
  getAllMedia,
  likeMedia,
  getShortUrl,
  shareMedia,
  viewMedia,
  getRankedMedia,
  getTrendingMedia,
  getMediaStats,
  getTotalViews
} from "../controllers/engagementController.js";
import { viewCooldown } from "../middleware/viewCooldown.js";

const router = express.Router();

// read
router.get("/videos", getAllMedia);
router.get("/ranked", getRankedMedia);
router.get("/trending", getTrendingMedia);
router.get("/:id", getMediaById);

// actions
router.post("/:id/like", likeMedia);
router.post("/:id/share", shareMedia);
router.post("/:id/view", viewCooldown, viewMedia);
router.get('/:id/shorturl', getShortUrl);
router.get("/:id/stats", getMediaStats);
router.get("/views/total", getTotalViews);
export default router;
