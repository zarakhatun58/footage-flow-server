// controllers/transcribeController.js
import { transcribeAudio } from '../utils/transcriptMock.js';
import { groqGenerate } from '../utils/storyHelper.js'; // optional, only if you want to use a separate prompt for emotion/story

export const transcribeAndAnalyze = async (req, res) => {
  try {
    const { filePath } = req.body;
    const transcript = await transcribeAudio(filePath);

    if (!transcript) {
      return res.status(500).json({ error: 'Failed to generate transcript.' });
    }


    const storyPrompt = `
      Given the transcript below, extract the dominant emotion and summarize it into a short story.
      Transcript: """${transcript}"""
      Return as JSON: { "emotion": "...", "story": "..." }
    `;

    const response = await groqGenerate(storyPrompt); // optional
    res.json({
      transcript,
      ...response, // includes emotion + story
    });
  } catch (err) {
    console.error('❌ Controller error:', err);
    res.status(500).json({ error: 'Transcription or analysis failed.' });
  }
};
