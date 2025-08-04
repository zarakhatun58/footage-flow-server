import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import storyUser from '../models/User.js';
import { sendEmail } from '../utils/sendEmail.js';
import { OAuth2Client } from 'google-auth-library';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

export const loginWithGoogle = async (req, res) => {
  const { token } = req.body;

  try {
    // 1. Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) return res.status(400).json({ error: 'Invalid Google token payload' });

    const { sub: googleId, email, name, picture } = payload;

    if (!email) return res.status(400).json({ error: 'Email not found in Google token' });

    // 2. Check if user exists
    let user = await storyUser.findOne({ email });

    // 3. Create if not exists
    if (!user) {
      user = await storyUser.create({
        googleId,
        email,
        username: name,
        profilePic: picture,
      });
    }

    // 4. Sign your app's JWT
    const appToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Return response
    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        profilePic: user.profilePic,
      },
      token: appToken,
    });

  } catch (err) {
    console.error('Google login error:', err);
    res.status(401).json({ error: 'Google token verification failed' });
  }
};
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

