// models/Story.js
import mongoose from 'mongoose';

const ClipSchema = new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  timestamp: String,
  duration: String,
  transcript: String,
  tags: [String],
  addedAt: { type: Date, default: Date.now },
});

const StorySchema = new mongoose.Schema({
  clips: [ClipSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Story', StorySchema);
