import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// 🔴 FIX (2026-02-21 REVISED): Use pdf-parse v1 API (simpler, buffer-based)
// v1 uses: const pdfParse = require('pdf-parse'); await pdfParse(buffer)
const pdfParse = require("pdf-parse");
import Knowledge from "./knowledge.model.js";
import Agent from "../agent/agent.model.js";

/**
 * Extract text from a file based on its type
 * - PDF: uses pdf-parse for native text extraction
 * - Images: uses Google Vision OCR (if available)
 * - Text files: reads directly
 */
const extractTextFromFile = async (filePath, mimeType) => {
  const ext = path.extname(filePath).toLowerCase();

  // PDF extraction using pdf-parse v1 (handles text-based PDFs)
  if (ext === ".pdf" || mimeType === "application/pdf") {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      // 🔴 FIX (2026-02-21 REVISED): Use pdf-parse v1 API - simple await pdfParse(buffer)
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text?.trim() || "";
      const pages = pdfData.numpages || 0;

      console.log(`🔍 PDF parse result: text=${text.length} chars, pages=${pages}`);

      if (text && text.length > 10) {
        console.log(`📄 PDF text extracted: ${text.length} chars from ${pages} pages`);
        return text;
      }

      // If pdf-parse returns very little text, try OCR as fallback for scanned PDFs
      console.log("⚠️ PDF has minimal text (<10 chars), trying Vision OCR fallback...");
      const ocrText = await extractWithVisionOCR(filePath);
      if (ocrText) {
        console.log(`✅ Vision OCR recovered ${ocrText.length} chars from PDF`);
        return ocrText;
      }

      // Both extraction methods failed
      console.error("❌ PDF extraction failed: pdf-parse returned <10 chars AND Vision OCR returned nothing");
      return null;
    } catch (err) {
      console.error("❌ PDF parse error:", err.message);
      console.log("   Trying Vision OCR fallback...");
      const ocrText = await extractWithVisionOCR(filePath);
      if (ocrText) {
        console.log(`✅ Vision OCR recovered ${ocrText.length} chars from PDF`);
        return ocrText;
      }
      return null;
    }
  }

  // Image OCR using Google Vision
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"].includes(ext)) {
    return await extractWithVisionOCR(filePath);
  }

  // Plain text / CSV / markdown
  if ([".txt", ".csv", ".md", ".json"].includes(ext)) {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.trim();
  }

  // DOCX - basic extraction (read as text)
  if (ext === ".docx") {
    // For now, try to read as best effort; full docx parsing would need mammoth
    console.log("⚠️ DOCX support is basic - recommend uploading as PDF");
    return null;
  }

  // BUG 2.4 FIX (2026-02-20): Accept ALL unknown file types and try OCR
  // Instead of returning null for unknown types, attempt Vision OCR extraction
  console.log(`📄 Unknown file type: ${ext} - Attempting Vision OCR extraction...`);
  const ocrText = await extractWithVisionOCR(filePath);
  if (ocrText) {
    console.log(`✅ Vision OCR succeeded for ${ext}: ${ocrText.length} chars extracted`);
    return ocrText;
  }

  console.warn(`⚠️  Unsupported file type ${ext} and Vision OCR returned no text`);
  return null;
};

/**
 * Google Vision OCR fallback for scanned documents and images
 */
const extractWithVisionOCR = async (filePath) => {
  try {
    const { visionClient } = await import("../../config/google.vision.client.js");
    if (!visionClient) {
      console.warn("⚠️ Vision client not available for OCR");
      return null;
    }
    const [result] = await visionClient.textDetection(filePath);
    const text = result.fullTextAnnotation?.text || "";
    if (text.trim()) {
      console.log(`🔍 Vision OCR extracted: ${text.trim().length} chars`);
    }
    return text.trim() || null;
  } catch (err) {
    console.error("Vision OCR error:", err.message);
    return null;
  }
};

/**
 * Upload and process a knowledge document
 * POST /knowledge/upload
 *
 * Accepts file upload, extracts text via PDF parser or OCR,
 * saves to Knowledge collection, and links to agent.
 */
export const uploadKnowledgeFile = async (req, res) => {
  try {
    const { agentId, title } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const fileName = title || req.file.originalname;

    // Determine source type
    const ext = path.extname(req.file.originalname).toLowerCase();
    let sourceType = "TEXT";
    if (ext === ".pdf") sourceType = "PDF";
    else if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"].includes(ext)) sourceType = "IMAGE";
    else if (ext === ".docx") sourceType = "DOCX";
    // BUG 2.4 FIX: All other types will be processed as TEXT or OCR-extracted

    console.log(`📥 Knowledge upload: ${fileName} (${sourceType}, ${(req.file.size / 1024).toFixed(1)} KB)`);

    // Extract text content
    const extractedText = await extractTextFromFile(filePath, mimeType);

    // Clean up uploaded file
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

    if (!extractedText || extractedText.length < 10) {
      const errorDetails = !extractedText
        ? "Text extraction returned nothing (check logs for pdf-parse or Vision OCR errors)"
        : `Extracted text too short (${extractedText.length} chars, need >10)`;

      console.error(`❌ Upload validation failed: ${errorDetails}`);

      return res.status(400).json({
        error: "Could not extract meaningful text from this file. Please ensure the document contains readable text.",
        details: errorDetails
      });
    }

    // Create knowledge document in DB
    const doc = await Knowledge.create({
      userId: req.user.id,
      agentId: agentId || null,
      title: fileName,
      sourceType,
      rawText: extractedText,
      meta: {
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        charCount: extractedText.length,
        wordCount: extractedText.split(/\s+/).length
      }
    });

    console.log(`✅ Knowledge saved: ${doc._id} (${extractedText.length} chars, ${extractedText.split(/\s+/).length} words)`);

    // If agentId provided, link this doc to the agent's knowledgeBase array
    if (agentId) {
      await Agent.findByIdAndUpdate(agentId, {
        $push: {
          knowledgeBase: {
            id: doc._id.toString(),
            knowledgeDocId: doc._id,
            name: fileName,
            size: `${(req.file.size / 1024).toFixed(1)} KB`,
            type: req.file.mimetype || sourceType,
            status: "synced",
            uploadedAt: new Date().toISOString(),
            content: extractedText  // Store full text for system prompt injection
          }
        }
      });
      console.log(`🔗 Linked to agent: ${agentId}`);
    }

    res.json({
      _id: doc._id,
      id: doc._id.toString(),
      title: doc.title,
      sourceType: doc.sourceType,
      charCount: extractedText.length,
      wordCount: extractedText.split(/\s+/).length,
      status: "synced",
      createdAt: doc.createdAt
    });
  } catch (err) {
    console.error("❌ Knowledge upload error:", err.message);
    // Clean up file on error
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: "Knowledge upload failed: " + err.message });
  }
};

/**
 * List knowledge documents
 * GET /knowledge?agentId=xxx
 */
export const listKnowledge = async (req, res) => {
  try {
    const filter = { userId: req.user.id };
    if (req.query.agentId) filter.agentId = req.query.agentId;

    const docs = await Knowledge.find(filter)
      .select("title sourceType meta createdAt agentId")
      .sort({ createdAt: -1 });

    res.json(docs.map(d => ({
      _id: d._id,
      id: d._id.toString(),
      title: d.title,
      sourceType: d.sourceType,
      charCount: d.meta?.charCount || 0,
      wordCount: d.meta?.wordCount || 0,
      fileSize: d.meta?.fileSize || 0,
      agentId: d.agentId,
      status: "synced",
      createdAt: d.createdAt
    })));
  } catch (err) {
    console.error("❌ List knowledge error:", err.message);
    res.status(500).json({ error: "Failed to list knowledge documents" });
  }
};

/**
 * Delete a knowledge document
 * DELETE /knowledge/:id
 */
export const deleteKnowledge = async (req, res) => {
  try {
    const doc = await Knowledge.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Remove from agent's knowledgeBase array if linked
    if (doc.agentId) {
      await Agent.findByIdAndUpdate(doc.agentId, {
        $pull: { knowledgeBase: { knowledgeDocId: doc._id } }
      });
    }

    // Also remove from any agents that have this doc by id string
    await Agent.updateMany(
      { "knowledgeBase.id": doc._id.toString() },
      { $pull: { knowledgeBase: { id: doc._id.toString() } } }
    );

    await Knowledge.findByIdAndDelete(doc._id);

    console.log(`🗑️ Knowledge deleted: ${doc._id}`);
    res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    console.error("❌ Delete knowledge error:", err.message);
    res.status(500).json({ error: "Failed to delete document" });
  }
};

/**
 * Get full text of a knowledge document (for agent training injection)
 * GET /knowledge/:id/content
 */
export const getKnowledgeContent = async (req, res) => {
  try {
    const doc = await Knowledge.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({
      _id: doc._id,
      title: doc.title,
      rawText: doc.rawText,
      sourceType: doc.sourceType,
      charCount: doc.rawText?.length || 0
    });
  } catch (err) {
    console.error("❌ Get content error:", err.message);
    res.status(500).json({ error: "Failed to get document content" });
  }
};

/**
 * Get all knowledge content for an agent (used during call initialization)
 * This fetches the full text of all documents linked to an agent
 * GET /knowledge/agent/:agentId/content
 */
export const getAgentKnowledgeContent = async (req, res) => {
  try {
    const docs = await Knowledge.find({
      agentId: req.params.agentId
    }).select("title rawText sourceType");

    res.json({
      documents: docs.map(d => ({
        title: d.title,
        content: d.rawText,
        sourceType: d.sourceType
      })),
      totalDocs: docs.length,
      totalChars: docs.reduce((sum, d) => sum + (d.rawText?.length || 0), 0)
    });
  } catch (err) {
    console.error("❌ Get agent knowledge error:", err.message);
    res.status(500).json({ error: "Failed to get agent knowledge" });
  }
};
