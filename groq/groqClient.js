import axios from "axios";


export const getStoryFromGroq = async (prompt, transcript) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: 'You are a creative story generator.',
        },
        {
          role: 'user',
          content: `Here is a transcript: ${transcript}\n\nMake a short, emotional story based on this prompt: "${prompt}"`,
        },
      ],
    },
    {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content;
};