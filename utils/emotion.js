import axios from 'axios';

export const getEmotionLabels = async (transcript) => {
  const prompt = `
  Analyze the following transcript and return dominant emotional themes as an array of 2-3 keywords.

  Transcript: """${transcript}"""

  Respond only in this strict JSON format: { "emotions": ["...", "..."] }
  `;

  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'mixtral-8x7b-32768',
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const content = res.data.choices?.[0]?.message?.content;
  const { emotions } = JSON.parse(content || '{}');
  return emotions || [];
};
