import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Media from '../models/Media.js';

import { getEmotionLabels } from '../utils/emotion.js';
import visionClient from '../utils/visionClient.js';
import { transcribeAudio } from '../utils/transcriptionService.js';
import { createVideoWithVoice } from '../utils/shotstackService.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js';
import { uploadFileToS3 } from '../utils/uploadToS3.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

export const uploadMiddleware = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 },
  { name: 'voiceover', maxCount: 1 }
]);

export const generateTagsFromTranscript = async (transcript) => {
  const words = transcript
    .replace(/[^\w\s]/gi, '')
    .split(/\s+/)
    .filter((word, i, arr) => word.length > 4 && arr.indexOf(word) === i);

  return words.slice(0, 5);
};

export const getImageTranscript = async (imagePath) => {
  try {
    const [result] = await visionClient.textDetection(imagePath);
    const detections = result.textAnnotations;
    const transcript = detections[0]?.description || '';
    return transcript.trim();
  } catch (err) {
    console.error('❌ Vision API error:', err.message || err);
    return '';
  }
};

// export const handleUpload = async (req, res) => {
//   try {
//     if (!req.files || Object.keys(req.files).length === 0) {
//       return res.status(400).json({ error: "No files uploaded." });
//     }

//     const uploaded = [];
//     const imageFiles = req.files.images || [];
//     const videoFiles = req.files.video || [];
//     const voiceFiles = req.files.voiceover || [];

//     for (const file of [...imageFiles, ...videoFiles, ...voiceFiles]) {
//       const filePath = file.path;
//       const mimeType = file.mimetype;

//       let mediaType = "unknown";
//       if (mimeType.startsWith("video/")) mediaType = "video";
//       else if (mimeType.startsWith("audio/")) mediaType = "audio";
//       else if (mimeType.startsWith("image/")) mediaType = "image";

//       const storyUrl = mediaType === "video"
//         ? `${process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com"}/uploads/${file.filename}`
//         : "";

//       const images = mediaType === "image"
//         ? [`${process.env.FRONTEND_URL || "https://footage-to-reel.onrender.com"}/uploads/${file.filename}`]
//         : [];

//       // Save media with placeholders first
//       const newMedia = new Media({
//         filename: file.filename,
//         mediaType,
//         transcript: "Not available",
//         emotions: ["Not detected"],
//         tags: ["Not generated"],
//         storyUrl,
//         images,
//         likes: 0,
//         shares: 0,
//         rankScore: 0,
//         status: "processing"
//       });

//       await newMedia.save();

//       try {
//         let transcript = "";
//         let emotions = [];
//         let tags = [];

//         if (mediaType === "audio") {
//           transcript = await transcribeAudio(filePath);
//         } else if (mediaType === "image") {
//           const [result] = await visionClient.textDetection(filePath);
//           const detections = result.textAnnotations;
//           transcript = detections[0]?.description || "";
//         }

//         if (transcript) {
//           emotions = await getEmotionLabels(transcript);
//           tags = await generateTagsFromTranscript(transcript);
//         }

//         newMedia.transcript = transcript || "Not available";
//         newMedia.emotions = emotions.length ? emotions : ["Not detected"];
//         newMedia.tags = tags.length ? tags : ["Not generated"];
//         newMedia.status = "completed";

//         // Special: If this is the final generated video, push to S3
//         if (mediaType === "video" && req.body.isFinal === "true") {
//           const s3Key = `final-videos/${file.filename}`;
//           const s3Url = await uploadFileToS3(filePath, s3Key);
//           newMedia.storyUrl = s3Url;
//         }

//         await newMedia.save();
//       } catch (err) {
//         console.error(`❌ Error processing ${mediaType}:`, err);
//         newMedia.status = "error";
//         await newMedia.save();
//       }

//       uploaded.push(newMedia);
//     }

//     return res.status(200).json({ uploaded });

//   } catch (error) {
//     console.error("❌ Upload error:", error);
//     res.status(500).json({ error: "Upload failed." });
//   }
// };

const API_PUBLIC_URL = process.env.API_PUBLIC_URL || 'http://localhost:5000';

export const handleUpload = async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded.' });
    }

    const uploaded = [];
    const imageFiles = req.files.images || [];
    const videoFiles = req.files.video || [];
    const voiceFiles = req.files.voiceover || [];

    const allFiles = [...imageFiles, ...videoFiles, ...voiceFiles];

    for (const file of allFiles) {
      const filePath = file.path; // local uploads/<filename>
      const mimeType = file.mimetype;

      let mediaType = 'unknown';
      if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';
      else if (mimeType.startsWith('image/')) mediaType = 'image';

      // Local public URL for previews (served by backend /uploads)
      const localPublicUrl = `${API_PUBLIC_URL}/uploads/${file.filename}`;

      // Defaults/Placeholders
      let transcript = 'Not available';
      let emotions = ['Not detected'];
      let tags = ['Not generated'];

      // Create initial doc
      const mediaDoc = new Media({
        filename: file.filename,
        mediaType,
        transcript,
        emotions,
        tags,
        storyUrl: mediaType === 'video' ? localPublicUrl : '',
        images: mediaType === 'image' ? [localPublicUrl] : [],
        likes: 0,
        shares: 0,
        views: 0,
        rankScore: 0,
        status: 'processing',
      });
      await mediaDoc.save();

      try {
        // Enrich metadata
        if (mediaType === 'audio') {
          const t = await transcribeAudio(filePath);
          if (t && t.trim()) {
            transcript = t.trim();
            emotions = await getEmotionLabels(transcript);
            tags = await generateTagsFromTranscript(transcript);
          }
          mediaDoc.voiceUrl = localPublicUrl;
        }

        if (mediaType === 'image') {
          const t = await getImageTranscript(filePath);
          if (t && t.trim()) {
            transcript = t.trim();
            emotions = await getEmotionLabels(transcript);
            tags = await generateTagsFromTranscript(transcript);
          }
          mediaDoc.images = [localPublicUrl];
        }

        // Only final generated videos go to S3
        const isFinal = req.body.isFinal === 'true' || req.body.isFinal === true;
        if (mediaType === 'video') {
          if (isFinal) {
            const s3Key = `final-videos/${file.filename}`;
            const s3Url = await uploadFileToS3(filePath, s3Key);
            mediaDoc.storyUrl = s3Url;

            // optional: delete local file after S3 upload
            try { fs.unlinkSync(filePath); } catch {}
          } else {
            mediaDoc.storyUrl = localPublicUrl; // local preview
          }
        }

        mediaDoc.transcript = transcript || 'Not available';
        mediaDoc.emotions = Array.isArray(emotions) && emotions.length ? emotions : ['Not detected'];
        mediaDoc.tags = Array.isArray(tags) && tags.length ? tags : ['Not generated'];
        mediaDoc.status = 'completed';

        await mediaDoc.save();
      } catch (err) {
        console.error(`❌ Error processing ${mediaType}:`, err);
        mediaDoc.status = 'error';
        await mediaDoc.save();
      }

      // Push plain object (not Mongoose doc)
      uploaded.push({
        _id: mediaDoc._id,
        filename: mediaDoc.filename,
        mediaType: mediaDoc.mediaType,
        transcript: mediaDoc.transcript,
        emotions: mediaDoc.emotions,
        tags: mediaDoc.tags,
        images: mediaDoc.images,
        voiceUrl: mediaDoc.voiceUrl,
        storyUrl: mediaDoc.storyUrl,
        status: mediaDoc.status,
        likes: mediaDoc.likes,
        shares: mediaDoc.shares,
        views: mediaDoc.views,
        rankScore: mediaDoc.rankScore,
      });
    }

    return res.status(200).json({ success: true, uploaded });
  } catch (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({ success: false, error: 'Upload failed.' });
  }
};


