// models/File.js
import mongoose from 'mongoose';

const FileSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // use uuid
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  file_size: { type: String, required: true },
  file_type: { type: String, required: true },
  duration: { type: String },
  transcription: { type: String },
  thumbnail_path: { type: String },
  processing_status: { type: String, default: 'pending' },
  tags: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now }
});

export default mongoose.model('File', FileSchema);
