import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  username: String,
  profilePic: String,
  createdAt: { type: Date, default: Date.now }
});
export default mongoose.model('storyUser', userSchema);

