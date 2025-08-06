import { getStoryFromGroq } from '../groq/groqClient.js';
import speech from '@google-cloud/speech';
import Media from '../models/Media.js';
import path from 'path';
import fetch from 'node-fetch';
import fs from 'fs';
import { getEmotionLabels } from '../utils/emotion.js';
import { generateVoiceOver } from '../utils/textToSpeechService.js';



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

// POST /api/generate - Generate AI story from prompt + transcript
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
      prompt: usedPrompt, // ✅ Save prompt
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
  const { transcript, prompt, story, tags = [], filename = 'manual_entry', mediaType = 'image', images = [], title, description, storyUrl, voiceUrl } = req.body;


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
      images,
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


// GET /api/videos?search=query
export const searchVideos = async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? {
        $or: [
          { transcript: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } },
          { title: { $regex: search, $options: 'i' } }
        ]
      }
      : {};

    const videos = await Media.find(query).sort({ createdAt: -1 });
    res.status(200).json({ videos });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
};

// POST /api/story/generate-all - Generates tags, emotions, story from transcript & updates media
export const generateTagsAndStory = async (req, res) => {
  try {
    const { mediaId, transcript, title } = req.body;

    if (!mediaId || !transcript?.trim()) {
      return res.status(400).json({ error: 'Media ID and transcript are required' });
    }

    // Emotion detection
    const emotions = await getEmotionLabels(transcript);

    // Tags (basic logic; can be replaced with OpenAI/GPT later)
    const words = transcript
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter((word, i, arr) => word.length > 4 && arr.indexOf(word) === i);
    const tags = words.slice(0, 5);

    // Story (using GROQ or GPT)
    const { story, emotion } = await getStoryFromGroq(title || 'Story Prompt', transcript);

    const updated = await Media.findByIdAndUpdate(
      mediaId,
      {
        $set: {
          title: title || undefined,
          tags,
          story,
          emotions: emotions || [emotion] || ['neutral']
        }
      },
      { new: true }
    );

    res.status(200).json({ success: true, media: updated });
  } catch (err) {
    console.error('❌ Failed to generate story data:', err.message);
    res.status(500).json({ error: 'Failed to process story' });
  }
};

// POST /api/speech/generate-video
export const generateAndRenderVideo = async (req, res) => {
  const { storyText, images, mediaId } = req.body;

  if (!storyText || !images?.length) {
    return res.status(400).json({ error: 'Story and images are required' });
  }

  try {
    // 1. Generate voice-over
    let voiceUrl;

    if (mediaId) {
      const media = await Media.findById(mediaId);
      if (media?.voiceUrl) {
        // ✅ Use existing voiceUrl from manual upload
        voiceUrl = `${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}${media.voiceUrl}`;

      } else {
        // 🧠 Generate voice from storyText
        const voicePath = await generateVoiceOver(storyText, `voice-${mediaId || Date.now()}.mp3`);
        const voiceFilename = path.basename(voicePath);
        voiceUrl = `${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}/uploads/audio/${voiceFilename}`;
        // 🔄 Save new voiceUrl if it was generated
        media.voiceUrl = `/uploads/audio/${voiceFilename}`;
        await media.save();
      }
    }
    // Cap video to 30 seconds max
    const maxTotalDuration = 30;
    const perImageDuration = 2;
    const maxImages = Math.floor(maxTotalDuration / perImageDuration);
    const trimmedImages = images.slice(0, maxImages);
    // 2. Send request to Shotstack
    const response = await fetch('https://api.shotstack.io/stage/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.SHOTSTACK_API_KEY
      },
      body: JSON.stringify({
        timeline: {
          background: "#000000",
          tracks: [
            {
              clips: trimmedImages.map((img, i) => ({
                asset: { type: "image", src: img },
                start: i * perImageDuration,
                length: perImageDuration,
                transition: { in: "fade", out: "fade" }
              }))
            },
            {
              clips: [
                {
                  asset: { type: "audio", src: voiceUrl },
                  start: 0,
                  length: trimmedImages.length * perImageDuration
                }
              ]
            }
          ]
        },
        output: {
          format: "mp4",
         resolution: "preview",
          size: {
            width: 640,
            height: 480
          }
        }
      })
    });

    const data = await response.json();
    console.log('📦 Shotstack response:', JSON.stringify(data, null, 2));

    const renderId = data.response?.id;
const videoUrl = data.response?.url || null;
    // e.g. in /api/speech/generate-video
    // const media = await Media.findById(mediaId);
    // media.renderId = renderId;
    // await media.save();

    if (!renderId) {
      console.error('❌ Shotstack did not return a render ID. Full response:', data);
      return res.status(500).json({ error: 'Shotstack failed to return render ID', details: data });
    }

    // 3. Save media updates
    if (mediaId) {
      await Media.findByIdAndUpdate(mediaId, {
        $set: {
          voiceUrl,
          images: trimmedImages,
           storyUrl: videoUrl, 
          renderId,
          status: 'video_requested'
        }
      });
    }

    console.log(`✅ Video requested. Media ID: ${mediaId}, Render ID: ${renderId}`);
    res.status(200).json({ success: true, renderId, id: mediaId,  storyUrl: videoUrl  });

  } catch (err) {
    console.error('❌ Video generation failed:', err.message);
    res.status(500).json({ error: 'Video generation failed' });
  }
};

// GET /api/speech/render-status/:renderId
export const checkRenderStatus = async (req, res) => {
  const { renderId } = req.params;

  try {
    const response = await fetch(`https://api.shotstack.io/stage/render/${renderId}`, {
      headers: {
        'x-api-key': process.env.SHOTSTACK_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    res.status(200).json({
      status: data?.response?.status,
      url: data?.response?.url || null
    });
  } catch (err) {
    console.error('❌ Error checking render status:', err.message);
    res.status(500).json({ error: 'Failed to fetch render status' });
  }
};


