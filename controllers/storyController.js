import { getStoryFromGroq } from '../groq/groqClient.js';
import speech from '@google-cloud/speech';
import * as chrono from "chrono-node";
import Media from '../models/Media.js';
import path from 'path';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import os from 'os';
import { getEmotionLabels } from '../utils/emotion.js';
import { generateVoiceOver, generateVoiceOverForStory } from '../utils/textToSpeechService.js';
import { generateWithCohere } from "../utils/cohere.js";
import nlp from 'compromise';
import { createStoryVideo } from '../utils/storyService.js';


// 1. Plan a story with Cohere
export const createStoryPlan = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const story = await generateWithCohere(prompt);
    res.json({ story });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const generateStoryVideo = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: "Text is required" });

    const result = await createStoryVideo(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};





// GET all uploaded entries
export const getAllVideos = async (req, res) => {
  try {
    const videos = await Media.find({
      status: 'completed',
      encodingStatus: 'ready',
    }).sort({ rankScore: -1, createdAt: -1 }); // no limit here

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


export const searchVideos = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let dateFilter = {};
    try {
      const parsedDates = chrono.parse(search);
      if (parsedDates.length) {
        const start = parsedDates[0].start.date();
        const end = parsedDates[0].end ? parsedDates[0].end.date() : start;
        dateFilter = { createdAt: { $gte: start, $lte: end } };
      }
    } catch (e) {
      console.warn("⚠️ Date parsing skipped:", e.message);
    }

    const regex = search ? new RegExp(search, "i") : null;
    const pipeline = [];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { tags: regex },
            { emotions: regex },
            { title: regex },
            { transcript: regex },
            { description: regex },
            { story: regex },
          ],
          ...dateFilter,
        },
      });
    } else if (Object.keys(dateFilter).length > 0) {
      pipeline.push({ $match: dateFilter });
    }

    pipeline.push({
      $addFields: {
        boostScore: {
          $add: [
            {
              $size: {
                $ifNull: [
                  { $filter: { input: "$tags", cond: { $eq: ["$$this", search.toLowerCase()] } } },
                  [],
                ],
              },
            },
            {
              $size: {
                $ifNull: [
                  { $filter: { input: "$emotions", cond: { $eq: ["$$this", search.toLowerCase()] } } },
                  [],
                ],
              },
            },
          ],
        },
      },
    });

    pipeline.push({
      $addFields: { score: { $add: ["$boostScore", 1] } },
    });

    pipeline.push({
      $facet: {
        paginatedResults: [
          { $sort: { score: -1, createdAt: -1 } },
          { $skip: skip },
          { $limit: parseInt(limit) },
        ],
        totalCount: [{ $count: "count" }],
      },
    });

    // ✅ Safe query with timeout (10s max)
    let result = [];
    try {
      result = await Promise.race([
        Media.aggregate(pipeline).allowDiskUse(true),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Query timeout")), 10000)
        ),
      ]);
    } catch (e) {
      console.warn("⚠️ Mongo query failed:", e.message);
      result = [{ paginatedResults: [], totalCount: [{ count: 0 }] }];
    }

    const videos = result[0]?.paginatedResults || [];
    const total = result[0]?.totalCount?.[0]?.count || 0;

    const maxScore = videos.length > 0 ? videos[0].score : 1;
    const videosWithConfidence = videos.map((v) => ({
      ...v,
      confidence: maxScore ? Math.round((v.score / maxScore) * 100) : 0,
    }));

    return res.status(200).json({
      videos: videosWithConfidence,
      page: parseInt(page),
      limit: parseInt(limit),
      totalVideos: total,
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error("❌ Unexpected search error:", err.message);
    return res.status(200).json({
      videos: [],
      page: 1,
      limit: 10,
      totalVideos: 0,
      totalPages: 0,
    });
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



// export const searchVideos = async (req, res) => {
//   try {
//     const { search } = req.query;

//     // If no search term, return all videos sorted by creation date
//     if (!search) {
//       const videos = await Media.find().sort({ createdAt: -1 }).lean();
//       return res.status(200).json({ videos });
//     }

//     // Date parsing using chrono-node
//     let dateFilter = null;
//     const parsedDates = chrono.parse(search);
//     if (parsedDates.length) {
//       const start = parsedDates[0].start.date();
//       const end = parsedDates[0].end ? parsedDates[0].end.date() : start;
//       dateFilter = { createdAt: { $gte: start, $lte: end } };
//     }

//     // Build dynamic search regex for tag/emotion/other fields
//     const searchRegex = new RegExp(search, "i"); // case-insensitive

//     const filters = [];

//     // Full-text search
//     filters.push({ $text: { $search: search } });

//     // Dynamic tag/emotion/other field search
//     filters.push({
//       $or: [
//         { tags: searchRegex },
//         { emotions: searchRegex },
//         { transcript: searchRegex },
//         { title: searchRegex },
//         { description: searchRegex },
//         { story: searchRegex },
//       ],
//     });

//     // Date filter if parsed
//     if (dateFilter) filters.push(dateFilter);

//     const query = { $and: filters };

//     // Execute query with text score
//     const videos = await Media.find(query, { score: { $meta: "textScore" } })
//       .sort({ score: { $meta: "textScore" }, createdAt: -1 })
//       .lean();

//     // Normalize confidence 0-100
//     const maxScore = videos.length > 0 ? videos[0].score : 1;
//     const videosWithConfidence = videos.map((v) => ({
//       ...v,
//       confidence: maxScore ? Math.round((v.score / maxScore) * 100) : 0,
//     }));

//     res.status(200).json({ videos: videosWithConfidence });
//   } catch (err) {
//     console.error("Search error:", err);
//     res.status(500).json({ error: "Search failed" });
//   }
// };

// thounds of video






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

// POST /api/speech/trigger-video
export const triggerVideoRender = async (req, res) => {
  const { storyText, images, mediaId } = req.body;

  if (!storyText || !images?.length) {
    return res.status(400).json({ error: 'Story and images are required' });
  }

  try {
    const media = await Media.findByIdAndUpdate(mediaId, {
      $set: {
        story: storyText,
        images,
        status: 'render_pending'
      }
    });

    // Queue background process — worker thread, job queue, or just async call
    setTimeout(() => generateAndRenderVideo({ storyText, images, mediaId }), 0);

    res.status(202).json({
      success: true,
      message: 'Render job started',
      id: mediaId
    });

  } catch (err) {
    console.error('❌ Failed to trigger video render:', err.message);
    res.status(500).json({ error: 'Failed to trigger render job' });
  }
};


// POST /api/speech/generate-video
// export const generateAndRenderVideo = async (req, res) => {
//   const { storyText, images, mediaId } = req.body;

//   if (!storyText || !images?.length) {
//     return res.status(400).json({ error: 'Story and images are required' });
//   }

//   try {
//     const perImageDuration = 2;
//     const maxTotalDuration = 12;
//     const maxImages = Math.floor(maxTotalDuration / perImageDuration);
//     const trimmedImages = images.slice(0, maxImages);

//     let voiceUrl;
//     const media = await Media.findById(mediaId);

//     if (media?.voiceUrl) {
//       voiceUrl = `${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}${media.voiceUrl}`;
//     } else {
//       const voicePath = await generateVoiceOver(storyText, `voice-${mediaId || Date.now()}.mp3`);
//       const voiceFilename = path.basename(voicePath);
//       voiceUrl = `${process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com'}/uploads/audio/${voiceFilename}`;

//       if (media) {
//         media.voiceUrl = `/uploads/audio/${voiceFilename}`;
//         await media.save();
//       }
//     }

//     const response = await fetch('https://api.shotstack.io/stage/render', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'x-api-key': process.env.SHOTSTACK_API_KEY
//       },
//       body: JSON.stringify({
//         timeline: {
//           background: "#000000",
//           tracks: [
//             {
//               clips: trimmedImages.map((img, i) => ({
//                 asset: { type: "image", src: img },
//                 start: i * perImageDuration,
//                 length: perImageDuration,
//                 transition: { in: "fade", out: "fade" }
//               }))
//             },
//             {
//               clips: [
//                 {
//                   asset: { type: "audio", src: voiceUrl },
//                   start: 0,
//                   length: trimmedImages.length * perImageDuration
//                 }
//               ]
//             }
//           ]
//         },
//         output: {
//           format: "mp4",
//           resolution: "sd"
//         }
//       })
//     });

//     const data = await response.json();
//     const renderId = data?.response?.id;
//     const videoUrl = data?.response?.url || null;

//     if (!renderId) {
//       console.error('❌ Shotstack did not return render ID:', data);
//       return res.status(500).json({ success: false, error: 'Render ID not received' });
//     }

//     await Media.findByIdAndUpdate(mediaId, {
//       $set: {
//         voiceUrl,
//         images: trimmedImages,
//         storyUrl: videoUrl,
//         renderId,
//         status: 'video_requested'
//       }
//     });

//     console.log(`✅ Video render started. Media ID: ${mediaId}, Render ID: ${renderId}`);

//     // ✅ Send full response with renderId to frontend
//     res.status(200).json({
//       success: true,
//       renderId,
//       id: mediaId,
//       storyUrl: videoUrl || null
//     });

//   } catch (err) {
//     console.error('❌ Video generation failed:', err.message);
//     res.status(500).json({ error: 'Video generation failed' });
//   }
// };
// POST /api/speech/generate-video


export const generateAndRenderVideo = async (req, res) => {
  const { storyText, images, mediaId } = req.body;

  if (!storyText || !images?.length) {
    return res.status(400).json({ error: 'Story and images are required' });
  }

  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://footage-to-reel.onrender.com';

    // Limit video duration
    const perImageDuration = 2; // seconds
    const maxTotalDuration = 12; // seconds
    const maxImages = Math.floor(maxTotalDuration / perImageDuration);
    const trimmedImages = images.slice(0, maxImages);

    // Construct full image URLs
    const imageUrls = trimmedImages.map(img =>
      img.startsWith('http') ? img : `${baseUrl}/uploads/${path.basename(img)}`
    );

    // Handle voice generation
    let voiceUrl;
    const media = await Media.findById(mediaId);

    if (media?.voiceUrl) {
      voiceUrl = `${baseUrl}${media.voiceUrl}`;
    } else {
      const voicePath = await generateVoiceOver(storyText, `voice-${mediaId || Date.now()}.mp3`);
      const voiceFilename = path.basename(voicePath);
      voiceUrl = `${baseUrl}/uploads/audio/${voiceFilename}`;

      if (media) {
        media.voiceUrl = `/uploads/audio/${voiceFilename}`;
        await media.save();
      }
    }

    // Prepare Shotstack payload
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
              clips: imageUrls.map((img, i) => ({
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
                  length: imageUrls.length * perImageDuration
                }
              ]
            }
          ]
        },
        output: {
          format: "mp4",
          resolution: "sd"
        }
      })
    });

    const data = await response.json();
    const renderId = data?.response?.id;
    const videoUrl = data?.response?.url || null;

    if (!renderId) {
      console.error('❌ Shotstack did not return render ID:', data);
      return res.status(500).json({ success: false, error: 'Render ID not received' });
    }

    // Update DB
    await Media.findByIdAndUpdate(mediaId, {
      $set: {
        voiceUrl,
        images: imageUrls,
        storyUrl: videoUrl,
        renderId,
        status: 'video_requested'
      }
    });

    console.log(`✅ Video render started. Media ID: ${mediaId}, Render ID: ${renderId}`);

    res.status(200).json({
      success: true,
      renderId,
      id: mediaId,
      storyUrl: videoUrl || null
    });

  } catch (err) {
    console.error('❌ Video generation failed:', err.message);
    res.status(500).json({ error: 'Video generation failed' });
  }
};


// GET /api/speech/render-status/:renderId

export const checkRenderStatus = async (req, res) => {
  const { renderId } = req.params;

  const apiBaseUrl =
    process.env.NODE_ENV === 'production'
      ? 'https://api.shotstack.io/v1/render'
      : 'https://api.shotstack.io/stage/render';

  try {
    const response = await fetch(`${apiBaseUrl}/${renderId}`, {
      headers: {
        'x-api-key': process.env.SHOTSTACK_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    console.log('📦 Shotstack raw status response:', JSON.stringify(data, null, 2));

    const status = data?.response?.status || null;
    const url = data?.response?.url || null;

    res.status(200).json({ status, url });
  } catch (err) {
    console.error('❌ Error checking render status:', err.message);
    res.status(500).json({ error: 'Failed to fetch render status' });
  }
};


