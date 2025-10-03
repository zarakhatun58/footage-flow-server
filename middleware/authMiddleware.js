import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const protect = (req, res, next) => {
  const auth = req.headers.authorization;
  console.log("[protect] Authorization header:", auth);

  if (!auth || !auth.startsWith('Bearer ')) {
    console.log("[protect] No token provided");
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId; // ✅ consistent key
    console.log("[protect] Decoded userId:", req.userId);
    next();
  } catch (err) {
    console.log("[protect] Invalid token:", err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};
