import { GoogleGenerativeAI } from "@google/generative-ai";

export const getGeminiClient = () => {
  const { GOOGLE_API_KEY } = process.env;

  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY missing");
  }

  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

  return {
    llm: genAI.getGenerativeModel({ model: "gemini-2.5-flash" }),
    embedding: genAI.getGenerativeModel({ model: "text-embedding-004" })
  };
};
