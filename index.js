import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import uploadRoutes from './routes/uploadRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB error', err));

app.use('/api', uploadRoutes);
app.use('/api', storyRoutes);
app.use('/api/auth', authRoutes);

app.get("/", (req, res) => {
    res.send("✅ Footage flow running");
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
