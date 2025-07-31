// utils/storyHelper.js
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export const groqGenerate = async (prompt) => {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'mixtral-8x7b-32768',
        messages: [
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const text = response.data.choices?.[0]?.message?.content?.trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('❌ Error in groqGenerate:', error.message || error);
    return {};
  }
};
