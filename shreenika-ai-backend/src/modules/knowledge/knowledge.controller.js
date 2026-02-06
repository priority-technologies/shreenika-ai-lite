import fs from "fs";
import Knowledge from "./knowledge.model.js";
import { visionClient } from "../../config/google.vision.client.js";
import { getGeminiClient } from "../../config/google.client.js";

const extractTextFromFile = async (filePath) => {
  const [result] = await visionClient.textDetection(filePath);
  const text = result.fullTextAnnotation?.text || "";
  return text.trim();
};

export const uploadKnowledgeFile = async (req, res) => {
  try {
    const { agentId, sourceType, title } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }

    const extractedText = await extractTextFromFile(req.file.path);
    if (!extractedText) {
      return res.status(400).json({ error: "No text detected" });
    }

    const { embedding } = getGeminiClient();
    const embeddingResult = await embedding.embedContent(extractedText);

    const doc = await Knowledge.create({
      userId: req.user.id,
      agentId,
      title,
      sourceType,
      rawText: extractedText,
      embedding: embeddingResult.embedding.values
    });

    fs.unlinkSync(req.file.path);
    res.json(doc);
  } catch (err) {
    console.error("❌ Knowledge upload error:", err.message);
    res.status(500).json({ error: "Knowledge upload failed" });
  }
};

export const listKnowledge = async (req, res) => {
  const filter = { userId: req.user.id };
  if (req.query.agentId) filter.agentId = req.query.agentId;

  const docs = await Knowledge.find(filter).sort({ createdAt: -1 });
  res.json(docs);
};
