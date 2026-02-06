import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { upload } from "./upload.middleware.js";
import {
  uploadKnowledgeFile,
  listKnowledge
} from "./knowledge.controller.js";

const router = express.Router();

router.use(requireAuth);

router.post("/upload", upload.single("file"), uploadKnowledgeFile);
router.get("/", listKnowledge);

export default router;
