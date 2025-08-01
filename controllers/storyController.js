import { getStoryFromGroq } from '../groq/groqClient.js';
import Media from '../models/Media.js';
import path from 'path';
import fetch from 'node-fetch';
import fs from 'fs';
import speech from '@google-cloud/speech';

const client = new speech.SpeechClient();

// Extract transcript from uploaded audio/video file using Google STT
export const transcribeAudio = async (req, res) => {
  const { filename } = req.body;
  const filePath = path.resolve('uploads', filename);

  try {
    const file = fs.readFileSync(filePath);
    const audioBytes = file.toString('base64');

    const audio = {
      content: audioBytes,
    };
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
    };
    const request = {
      audio,
      config,
    };

    const [response] = await client.recognize(request);
    const transcript = response.results.map(r => r.alternatives[0].transcript).join('\n');

    res.status(200).json({ transcript });
  } catch (err) {
    console.error('❌ Transcription failed:', err.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
};

// GET all uploaded entries
export const getAllVideos = async (req, res) => {
  try {
    const videos = await Media.find().sort({ createdAt: -1 });
    res.status(200).json({ videos });
  } catch (err) {
    console.error('❌ Fetch videos failed:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
};

// POST /api/story/generate - Generate AI story from prompt + transcript
export const generateStory = async (req, res) => {
  const { prompt, transcript, filename = 'transcript_only_input', mediaType = 'video' } = req.body;

  if (!prompt?.trim() || !transcript?.trim()) {
    return res.status(400).json({ error: 'Prompt and transcript are required' });
  }

  try {
    const { story, emotion } = await getStoryFromGroq(prompt, transcript);

    if (!story || typeof story !== 'string') {
      throw new Error('Invalid story generated');
    }

    const newVideo = new Media({
      filename,
      mediaType,
      transcript,
      story,
      emotion: emotion || 'neutral',
      createdAt: new Date(),
    });

    await newVideo.save();

    console.log('✅ Story generated and saved with ID:', newVideo._id);
    res.status(201).json({ success: true, story, emotion, id: newVideo._id });
  } catch (err) {
    console.error('❌ Error generating story:', err.message);
    res.status(500).json({ error: 'Failed to generate story' });
  }
};


// POST /api/story/tags - Generate tags from transcript
export const generateTags = async (req, res) => {
  const { transcript } = req.body;

  if (!transcript?.trim()) {
    return res.status(400).json({ error: 'Transcript is required' });
  }

  try {
    const words = transcript
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter((word, i, arr) => word.length > 4 && arr.indexOf(word) === i);

    const tags = words.slice(0, 5);
    res.status(200).json({ tags });
  } catch (err) {
    console.error('❌ Tag generation failed:', err.message);
    res.status(500).json({ error: 'Failed to generate tags' });
  }
};

// POST /api/story/save - Save story manually
export const saveStory = async (req, res) => {
  const { transcript, prompt, story, tags = [], filename = 'manual_entry', mediaType = 'image', title, description, storyUrl, voiceUrl} = req.body;

  
  if (!transcript?.trim()) {
    return res.status(400).json({ error: 'Transcript is required' });
  }

  try {
    const emotions = await getEmotionLabels(transcript); // 🧠 Detect emotion

    const newMedia = new Media({
      filename,
      mediaType,
      transcript,
      story,
      tags: Array.isArray(tags) ? tags : [],
      title,
      description,
      storyUrl,
      voiceUrl,
      emotions, // 🔥 Save emotions
      createdAt: new Date()
    });

    await newMedia.save();

    console.log('✅ Story manually saved with ID:', newMedia._id);
    res.status(201).json({ success: true, id: newMedia._id });
  } catch (err) {
    console.error('❌ Failed to save to database:', err.message);
    res.status(500).json({ error: 'Failed to save to database' });
  }
};

// POST /api/story/create - Use all transcripts + prompt to generate a new story
export const createStory = async (req, res) => {
  const { prompt } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const videos = await Media.find();
    const transcript = videos.map(v => v.transcript).join('\n');

    if (!transcript.trim()) {
      return res.status(400).json({ error: 'No transcripts available in database' });
    }

    const story = await getStoryFromGroq(prompt, transcript);

    if (!story || story === 'Error generating story.') {
      throw new Error('Story generation failed');
    }

    res.status(200).json({ story });
  } catch (err) {
    console.error('❌ Story creation failed:', err.message || err);
    res.status(500).json({ error: 'Story creation failed' });
  }
};

// POST /api/shotstack/generate-video
export const handleUploadAndGenerateVideo = async (req, res) => {
  const { images, voiceUrl } = req.body;

  if (!images || !voiceUrl) {
    return res.status(400).json({ error: 'Images and voice URL are required' });
  }

  try {
    const clips = images.map((img, index) => ({
      asset: { type: 'image', src: img },
      start: index * 2,
      length: 2,
      transition: { in: 'fade', out: 'fade' }
    }));

    const audioClip = {
      asset: {
        type: 'audio',
        src: voiceUrl
      },
      start: 0,
      length: images.length * 2
    };

    const payload = {
      timeline: {
        background: '#000000',
        tracks: [
          { clips },
          { clips: [audioClip] }
        ]
      },
      output: {
        format: 'mp4',
        resolution: 'sd'
      }
    };

    const shotstackRes = await fetch('https://api.shotstack.io/stage/render', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.SHOTSTACK_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await shotstackRes.json();

    if (data.response && data.response.id) {
      res.status(200).json({ success: true, renderId: data.response.id });
    } else {
      throw new Error('Invalid Shotstack response');
    }
  } catch (err) {
    console.error('❌ Shotstack error:', err.message);
    res.status(500).json({ error: 'Cloud video generation failed' });
  }
};

export const detectEmotion = async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'Transcript required' });

  try {
    // Replace with your emotion detection logic or API
    const emotionLabels = await getEmotionLabels(transcript); // pseudo method
    res.status(200).json({ emotions: emotionLabels });
  } catch (err) {
    console.error('❌ Emotion detection failed:', err.message);
    res.status(500).json({ error: 'Failed to detect emotion' });
  }
};
