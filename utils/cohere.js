// utils/cohere.js
import { CohereClient } from "cohere-ai";

const cohere = new CohereClient({
  token: process.env.CO_API_KEY,
});

export async function generateWithCohere(prompt) {
  try {
    const response = await cohere.generate({
      model: "command-r-plus", // you can also try "command" or "command-light"
      prompt,
      max_tokens: 200,
    });

    return response.generations[0].text.trim();
  } catch (error) {
    console.error("❌ Cohere request failed:", error);
    throw new Error(`[Cohere API Error]: ${error.message}`);
  }
}
