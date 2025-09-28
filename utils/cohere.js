// utils/cohere.js
import { CohereClient } from "cohere-ai";

const cohere = new CohereClient({
  token: process.env.CO_API_KEY,
});

export async function generateWithCohere(prompt) {
  try {
    // Use the new Chat API
    const response = await cohere.chat({
      model: "command-r-08-2024", 
      message: prompt,
      max_tokens: 200,
    });

    // The text is now inside response.text
    return response.text.trim();
  } catch (error) {
    console.error("❌ Cohere request failed:", error);
    throw new Error(`[Cohere API Error]: ${error.message}`);
  }
}
