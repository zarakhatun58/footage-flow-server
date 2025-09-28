import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Media from '../models/Media.js';

import { getEmotionLabels } from '../utils/emotion.js';
import visionClient from '../utils/visionClient.js';
import { transcribeAudio } from '../utils/transcriptionService.js';
import { generateVideoToS3 } from '../utils/uploadToS3.js';
import { getStoryFromGroq } from './../groq/groqClient.js';


// ------------------ Helpers ------------------

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

const API_PUBLIC_URL = process.env.API_PUBLIC_URL || 'http://localhost:5000';


// ------------------ Upload Handler ------------------

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
      const filePath = file.path;
      const mimeType = file.mimetype;

      let mediaType = 'unknown';
      if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';
      else if (mimeType.startsWith('image/')) mediaType = 'image';

      const localPublicUrl = `${API_PUBLIC_URL}/uploads/${file.filename}`;

      let transcript = 'Not available';
      let emotions = ['Not detected'];
      let tags = ['Not generated'];

      // Initial doc
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
        // Handle audio
        if (mediaType === 'audio') {
          const t = await transcribeAudio(filePath);
          if (t && t.trim()) {
            transcript = t.trim();
            emotions = await getEmotionLabels(transcript);
            tags = await generateTagsFromTranscript(transcript);
          }
          mediaDoc.voiceUrl = localPublicUrl;
        }

        // Handle image
        if (mediaType === 'image') {
          const t = await getImageTranscript(filePath);
          if (t && t.trim()) {
            transcript = t.trim();
            emotions = await getEmotionLabels(transcript);
            tags = await generateTagsFromTranscript(transcript);
          }
          mediaDoc.images = [localPublicUrl];
        }

        // Handle video
        const isFinal = req.body.isFinal === 'true' || req.body.isFinal === true;
        if (mediaType === 'video') {
          if (isFinal) {
            const s3Key = `final-videos/${file.filename}`;
            const s3Url = await generateVideoToS3({
              imagePaths: [filePath],
              audioPath: null,
              s3Bucket: process.env.AWS_BUCKET_NAME,
              s3Key
            });
            mediaDoc.storyUrl = s3Url;
            try { fs.unlinkSync(filePath); } catch { }
          } else {
            mediaDoc.storyUrl = localPublicUrl;
          }
        }

        // ✅ Auto Story Generation
        if (transcript && transcript.trim()) {
          try {
            const defaultPrompt = "Write an engaging short story based on this content.";
            const { story, prompt: usedPrompt } = await getStoryFromGroq(defaultPrompt, transcript);

            if (story && story.trim()) {
              mediaDoc.story = story;
              mediaDoc.prompt = usedPrompt;
            }
          } catch (err) {
            console.error("❌ Story generation failed:", err.message);
          }
        }

        // Final metadata update
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

      // Push response
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
        story: mediaDoc.story,     // ✅ now returned
        prompt: mediaDoc.prompt,   // ✅ now returned
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


// ------------------ Manual Story API ------------------
// POST /api/generate
export const generateStory = async (req, res) => {
  const { prompt, transcript, filename = 'transcript_only_input', mediaType = 'video' } = req.body;

  if (!prompt?.trim() || !transcript?.trim()) {
    return res.status(400).json({ error: 'Prompt and transcript are required' });
  }

  try {
    const { story, prompt: usedPrompt } = await getStoryFromGroq(prompt, transcript);

    if (!story || typeof story !== 'string') {
      throw new Error('Invalid story generated');
    }

    const newVideo = new Media({
      filename,
      mediaType,
      transcript,
      story,
      prompt: usedPrompt,
      emotion: 'neutral',
      createdAt: new Date(),
    });

    await newVideo.save();

    console.log('✅ Story generated and saved with ID:', newVideo._id);
    res.status(201).json({ success: true, story, prompt: usedPrompt, id: newVideo._id });
  } catch (err) {
    console.error('❌ Error generating story:', err.message);
    res.status(500).json({ error: 'Failed to generate story' });
  }
};
