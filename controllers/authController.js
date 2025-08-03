import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import storyUser from '../models/User.js';
import { sendEmail } from '../utils/sendEmail.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const register = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existing = await storyUser.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new storyUser({ username, email, password: hashed });
    await user.save();

    res.status(201).json({ message: 'Registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  console.log("Login attempt:", email, password);

  try {
    const user = await storyUser.findOne({ email });
    console.log("User found:", user);

    if (!user || !user.password) {
      return res.status(400).json({ error: 'Invalid credentials (no user or no password)' });
    }

    const match = await bcrypt.compare(password, user.password);
    console.log("Password match:", match);

    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials (bad password)' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};


export const getProfile = async (req, res) => {
  try {
    const user = await storyUser.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

export const logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
  });
  res.status(200).json({ message: 'Logged out successfully' });
};


// export const loginWithGoogle = async (req, res) => {
//   const { idToken } = req.body;
//   const decoded = await verifyIdToken(idToken);

//   if (!decoded) return res.status(401).json({ error: 'Invalid token' });

//   const { uid, email, name, picture } = decoded;

//   let user = await storyUser.findOne({ googleId: uid });
//   if (!user) {
//     user = await storyUser.create({
//       googleId: uid,
//       email,
//       username: name,
//       profilePic: picture
//     });
//   }

//   res.json({
//     message: 'Login successful',
//     user: {
//       id: user._id,
//       email: user.email,
//       username: user.username,
//       profilePic: user.profilePic
//     }
//   });
// };

// export const getMe = async (req, res) => {
//   const decoded = await verifyIdToken(req.headers.authorization);
//   if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

//   const user = await storyUser.findOne({ googleId: decoded.uid });
//   if (!user) return res.status(404).json({ error: 'User not found' });

//   res.json({
//     id: user._id,
//     email: user.email,
//     username: user.username,
//     profilePic: user.profilePic
//   });
// };

// Route: POST /api/auth/forgot-password

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await storyUser.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const resetToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '15m' });
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const html = `
      <h3>Password Reset Request</h3>
      <p>Click the link below to reset your password. This link expires in 15 minutes:</p>
      <a href="${resetLink}">${resetLink}</a>
    `;

    await sendEmail(user.email, 'Reset Your Password', html);

    res.json({ message: "Reset email sent", resetToken });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Error generating or sending reset token' });
  }
};

// Route: POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await storyUser.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(400).json({ error: 'Token invalid or expired' });
  }
};

