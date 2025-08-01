import mongoose from "mongoose";

// models/Media.js
const MediaSchema = new mongoose.Schema({
  filename: String,
  mediaType: String, 
  transcript: String,
  tags: [String],
  emotions: [String],
  story: String,
  title: String,
  description: String,
  voiceUrl: String,
  storyUrl: String,
  likes: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
    rankScore: { type: Number, default: 0 }, 
  status: { type: String, default: 'uploaded' },
  createdAt: { type: Date, default: Date.now }
});


export default mongoose.model('Media', MediaSchema);
