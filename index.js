import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path, { dirname } from 'path';
import uploadRoutes from './routes/uploadRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import authRoutes from './routes/authRoutes.js';
import emotionRoutes from './routes/emotionRoutes.js';
import shotstackRoutes from './routes/shotstackRoutes.js';
import transcribeRoutes from './routes/transcribeRoutes.js';
import shareRoutes from './routes/shareRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import allFileRoutes from './routes/allFileRoutes.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Move this block ABOVE any path usage
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Now this will work properly
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  console.log('📂 Created uploads directory');
}

const allowedOrigins = [
  'http://localhost:8080',        
  'https://footage-to-reel.onrender.com',
];
const corsOptions = {
  origin: function (origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) {
    //  if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.lovable.app')) {
      callback(null, true);
    } else {
      console.error(`❌ CORS blocked from origin: ${origin}`);
      callback(new Error('❌ CORS blocked: Not allowed by server'));
    }
  },
  methods: ['GET', 'POST','PUT','DELETE', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB error', err));

// ✅ Serve static uploads
app.use('/uploads', express.static(uploadsPath));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api', uploadRoutes);
app.use('/api', storyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', emotionRoutes);
app.use('/api/shotstack', shotstackRoutes);
app.use('/api', transcribeRoutes);
app.use('/api/media', shareRoutes);
app.use('/api', fileRoutes);
app.use('/api/files', allFileRoutes);


app.get("/", (req, res) => {
  res.send("✅ Footage flow running");
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT} `));
