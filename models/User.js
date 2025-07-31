import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
 googleId: String,
  email: { type: String, required: true },
  username: String,
  profilePic: String,
  password: String, // ← ADD THIS
  createdAt: { type: Date, default: Date.now }
});
export default mongoose.model('storyUser', userSchema);

