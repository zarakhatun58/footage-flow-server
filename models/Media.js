import mongoose from "mongoose";

const MediaSchema = new mongoose.Schema({
  filename: String,
  mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
  transcript: String,
  story: String,
  tags: [String],
  visionLabels: [String],
  emotion: { type: String, default: 'neutral' }, // ✅ NEW
  title: String, // ✅ Optional user-defined
  description: String, // ✅ Optional user-defined
  voiceUrl: String, // ✅ Voiceover MP3 link
  storyUrl: String, // ✅ Generated video URL (from Shotstack)
  likes: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  emotions: [String],
  status: { type: String, default: 'uploaded' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Media', MediaSchema);
