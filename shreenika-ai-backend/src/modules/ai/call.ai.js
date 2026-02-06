import PromptCache from "../cache/promptCache.model.js";
import { getGeminiClient } from "../../config/google.client.js";

export const runCallAI = async ({ agentId, recordingUrl }) => {
  const hash = `${agentId}:${recordingUrl}`;

  const cached = await PromptCache.findOne({ hash });
  if (cached) {
    return JSON.parse(cached.response);
  }

  const { llm } = getGeminiClient();

  const prompt = `
  Analyze this phone call recording:
  ${recordingUrl}

  Tasks:
  1. Transcribe the call
  2. Summarize in 2 lines
  3. Detect sentiment (Positive | Neutral | Negative)

  Output JSON:
  {
    "transcript": "...",
    "summary": "...",
    "sentiment": "..."
  }
  `;

  const result = await llm.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text);

  await PromptCache.create({
    hash,
    response: JSON.stringify(parsed),
    tokensUsed: text.length
  });

  return parsed;
};
