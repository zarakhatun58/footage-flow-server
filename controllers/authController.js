import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import storyUser from '../models/User.js';
import { verifyIdToken } from '../utils/firebaseAdmin.js';

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
  try {
    const user = await storyUser.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

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
  res.json({ message: 'Logout handled client-side (just delete token)' });
};

export const loginWithGoogle = async (req, res) => {
  const { idToken } = req.body;
  const decoded = await verifyIdToken(idToken);

  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const { uid, email, name, picture } = decoded;

  let user = await storyUser.findOne({ googleId: uid });
  if (!user) {
    user = await storyUser.create({
      googleId: uid,
      email,
      username: name,
      profilePic: picture
    });
  }

  res.json({
    message: 'Login successful',
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      profilePic: user.profilePic
    }
  });
};

export const getMe = async (req, res) => {
  const decoded = await verifyIdToken(req.headers.authorization);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

  const user = await storyUser.findOne({ googleId: decoded.uid });
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: user._id,
    email: user.email,
    username: user.username,
    profilePic: user.profilePic
  });
};