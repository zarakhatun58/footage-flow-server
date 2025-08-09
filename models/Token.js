import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // associate tokens with your user system
  access_token: String,
  refresh_token: String,
  scope: String,
  token_type: String,
  expiry_date: Number,
});

const Token = mongoose.model('Token', tokenSchema);

export default Token;
