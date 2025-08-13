// middleware/viewCooldown.js
const cooldownMap = new Map(); // Key: `${ip}:${videoId}`, Value: timestamp

// Cooldown in ms (e.g., 60 seconds)
const COOLDOWN_TIME = 60 * 1000;

export const viewCooldown = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const videoId = req.params.id;

  const key = `${ip}:${videoId}`;
  const now = Date.now();

  if (cooldownMap.has(key)) {
    const lastViewTime = cooldownMap.get(key);
    if (now - lastViewTime < COOLDOWN_TIME) {
      console.warn(`🚫 View blocked: IP=${ip}, VideoID=${videoId}, TimeDiff=${now - lastViewTime}ms`);
      return res.status(429).json({
        success: false,
        message: "You are viewing too frequently. Please wait before watching again."
      });
    }
  }

  cooldownMap.set(key, now);
  next();
};
