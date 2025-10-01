import mongoose from 'mongoose';

const reelUserSchema = new mongoose.Schema({
 googleId: String,
   email: { type: String, required: true, unique: true }, 
  username: String,
  profilePic: String,
  password: String,
  googleAccessToken: String,   
  googleRefreshToken: String,  
  createdAt: { type: Date, default: Date.now }
});
export default mongoose.model('reelUser', reelUserSchema);

