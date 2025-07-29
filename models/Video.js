import mongoose from 'mongoose';

const VideoSchema = new mongoose.Schema({
  filename: String,
  transcript: String,
  tags: [String],
  visionLabels: [String], // from GCP Vision
  userId: mongoose.Schema.Types.ObjectId, // link to storyUser
  status: { type: String, default: 'uploaded' },
  createdAt: { type: Date, default: Date.now }
});
export default mongoose.model('Video', VideoSchema);