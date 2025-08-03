import axios from 'axios';

export const getStoryFromGroq = async (prompt, transcript) => {
  const apiKey = process.env.GROQ_API_KEY;
  const model = 'llama3-70b-8192';

  if (!apiKey) {
    console.error('❌ Missing GROQ_API_KEY in environment variables.');
    return '⚠️ Unable to generate story due to missing API key.';
  }

  const messages = [
    {
      role: 'system',
      content: 'You are a creative story generator.',
    },
    {
      role: 'user',
      content: `Here is a transcript: ${transcript}\n\nMake a short, emotional story based on this prompt: "${prompt}"`,
    },
  ];

  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model,
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = res.data.choices?.[0]?.message?.content;
    console.log('📖 Groq story generated');
    return content?.trim() || '⚠️ No story generated.';
  } catch (err) {
    if (err.response) {
      console.error('❌ Story generation failed:', err.response.status, err.response.data);
    } else {
      console.error('❌ Story generation error:', err.message);
    }
    return '⚠️ Failed to generate story.';
  }
};
