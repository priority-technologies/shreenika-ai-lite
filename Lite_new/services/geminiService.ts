
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
// Initialize loosely; if key is missing, we handle it in the methods
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateMockTranscript = async (
  agentName: string,
  agentPrompt: string,
  leadName: string
): Promise<string> => {
  if (!ai) {
    return `[Mock Transcript - API Key Missing]\n${agentName}: Hello ${leadName}, how are you?\n${leadName}: I'm good thanks.\n(System: Configure API Key to generate real AI transcripts)`;
  }

  try {
    const prompt = `
      Generate a realistic, short phone conversation transcript (about 4-6 turns) between an AI agent named "${agentName}" and a lead named "${leadName}".
      
      The Agent's System Instruction/Persona is: "${agentPrompt}"
      
      The conversation should reflect a cold call or follow-up scenario.
      Format it as:
      Agent: [text]
      Lead: [text]
      
      Keep it realistic.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Transcript generation failed.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return `Agent: Hello ${leadName}.\nLead: Hi.\n[Error generating full transcript]`;
  }
};

export const analyzeCall = async (transcript: string) => {
  if (!ai) {
    return { summary: "Mock summary due to missing API key.", sentiment: "Neutral" };
  }

  try {
    const prompt = `
      Analyze the following call transcript:
      "${transcript}"

      1. Provide a 1-sentence summary.
      2. Determine the sentiment (Positive, Neutral, Negative).

      Output JSON format:
      {
        "summary": "...",
        "sentiment": "..."
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
    throw new Error("No text returned");
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return { summary: "Could not analyze call.", sentiment: "Neutral" };
  }
};

export const improveAgentPrompt = async (currentPrompt: string, userInstruction: string): Promise<string> => {
  if (!ai) {
    return currentPrompt + "\n\n[Copilot Error: API Key missing. Please check your configuration.]";
  }

  try {
    const prompt = `
      You are an expert AI Prompt Engineer for Voice Agents.
      
      Current System Prompt:
      "${currentPrompt}"
      
      User Instruction for Improvement/Generation:
      "${userInstruction}"
      
      Task:
      Rewrite or generate a comprehensive, professional system prompt for a Voice AI Agent based on the user's instruction.
      Include sections for ## Objective, ## Role, ## Personality, and ## Rules/Tasks.
      The output should be ready to paste into the agent's configuration.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || currentPrompt;
  } catch (error) {
    console.error("Gemini Prompt Gen Error:", error);
    return currentPrompt;
  }
};
