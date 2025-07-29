import { getStoryFromGroq } from '../groq/groqClient.js';
import Video from '../models/Video.js';



// ✅ GET all videos: /api/story/videos
export const getAllVideos = async (req, res) => {
  try {
    const videos = await Video.find().sort({ uploadedAt: -1 });
    res.status(200).json({ videos });
  } catch (err) {
    console.error('❌ Fetch videos failed:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
};

// ✅ POST generate story: /api/story/generate
export const generateStory = async (req, res) => {
  const { prompt, transcript, filename = 'transcript_only_input' } = req.body;

  if (!prompt?.trim() || !transcript?.trim()) {
    return res.status(400).json({ error: 'Prompt and transcript are required' });
  }

  try {
    const story = await getStoryFromGroq(prompt, transcript);

    if (!story || typeof story !== 'string') {
      throw new Error('Invalid story generated');
    }

    const newVideo = new Video({
      filename,
      transcript,
      story,
      uploadedAt: new Date(),
    });

    await newVideo.save();

    console.log('✅ Story generated and saved with ID:', newVideo._id);
    res.status(201).json({ success: true, story, id: newVideo._id });
  } catch (err) {
    console.error('❌ Error generating story:', err.message);
    res.status(500).json({ error: 'Failed to generate story' });
  }
};

// ✅ POST generate tags: /api/story/tags
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

// ✅ POST save manually: /api/story/save
export const saveStory = async (req, res) => {
  const { transcript, prompt, story, tags } = req.body;

  if (!transcript?.trim()) {
    return res.status(400).json({ error: 'Transcript is required' });
  }

  try {
    const newVideo = new Video({
      filename: 'manual_entry',
      transcript,
      story,
      tags: tags?.split(',').map(t => t.trim()) || [],
      uploadedAt: new Date(),
    });

    await newVideo.save();

    console.log('✅ Story manually saved with ID:', newVideo._id);
    res.status(201).json({ success: true, id: newVideo._id });
  } catch (err) {
    console.error('❌ Failed to save to database:', err.message);
    res.status(500).json({ error: 'Failed to save to database' });
  }
};

export const createStory = async (req, res) => {
//   const { prompt } = req.body;
const { prompt, transcript } = req.body;
  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const videos = await Video.find();
    const transcript = videos.map(v => v.transcript).join('\n');

    if (!transcript.trim()) {
      return res.status(400).json({ error: 'No transcripts available in database' });
    }

    // const story = await getStoryFromGroq(prompt, transcript);
    const story = await getStoryFromGroq(prompt, transcript || context);

    if (!story || story === 'Error generating story.') {
      throw new Error('Story generation failed');
    }

    res.status(200).json({ story });
  } catch (err) {
    console.error('❌ Story creation failed:', err.message || err);
    res.status(500).json({ error: 'Story creation failed' });
  }
};
