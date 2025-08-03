import axios from 'axios';

export const getEmotionLabels = async (transcript) => {
  if (!transcript || transcript.trim().length === 0) {
    console.warn('⚠️ Skipping emotion detection due to empty transcript.');
    return [];
  }

  const prompt = `
    Analyze the following transcript and return dominant emotional themes as an array of 2-3 keywords.
    Transcript: """${transcript}"""
    Respond only in this strict JSON format: { "emotions": ["...", "..."] }
  `;

  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
       model: 'llama3-70b-8192', 
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = res.data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content || '{}');
    return parsed.emotions || [];
  } catch (err) {
    console.error('❌ Emotion API error:', err.response?.data || err.message);
    return [];
  }
};

