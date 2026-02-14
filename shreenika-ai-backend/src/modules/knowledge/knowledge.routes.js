import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { upload } from "./upload.middleware.js";
import {
  uploadKnowledgeFile,
  listKnowledge,
  deleteKnowledge,
  getKnowledgeContent,
  getAgentKnowledgeContent
} from "./knowledge.controller.js";

const router = express.Router();

router.use(requireAuth);

router.post("/upload", upload.single("file"), uploadKnowledgeFile);
router.get("/", listKnowledge);
router.delete("/:id", deleteKnowledge);
router.get("/:id/content", getKnowledgeContent);
router.get("/agent/:agentId/content", getAgentKnowledgeContent);

export default router;
