// models/Media.js
import mongoose from "mongoose";

const MediaSchema = new mongoose.Schema({
  filename: String,
  mediaType: String, // e.g., "image", "video"
  transcript: String,
  tags: [String],
  emotions: [String],
  images: [String], // multiple image support
  story: String,
  title: String,
  description: String,
  voiceUrl: String, // generated audio file path
  storyUrl: String, // final video playback URL (API.video)
  renderId: String, // API.video videoId
  encodingStatus: { type: String, default: 'processing' }, // 'processing', 'ready', 'failed'
  likes: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  rankScore: { type: Number, default: 0 },
  status: { type: String, default: 'uploaded' }, // 'uploaded', 'processing', 'completed', etc.
  createdAt: { type: Date, default: Date.now }
});
// Add text index for full-text search on transcript, tags, and title
MediaSchema.index({ transcript: 'text', tags: 'text', title: 'text' });

export default mongoose.model('Media', MediaSchema);
