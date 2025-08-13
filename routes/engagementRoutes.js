// routes/engagementRoutes.js
import express from "express";
import {
  getMediaById,
  getAllVideos,
  likeMedia,
  shareMedia,
  viewMedia,
  getRankedVideos,
  getTrendingVideos
} from "../controllers/engagementController.js";
import { viewCooldown } from "../middleware/viewCooldown.js";

const router = express.Router();

// read
router.get("/videos", getAllVideos);
router.get("/ranked", getRankedVideos);
router.get("/trending", getTrendingVideos);
router.get("/:id", getMediaById);

// actions
router.post("/:id/like", likeMedia);
router.post("/:id/share", shareMedia);
router.post("/:id/view", viewCooldown, viewMedia);
export default router;
