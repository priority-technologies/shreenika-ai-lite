import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
} from "./apikey.controller.js";

const router = express.Router();

// All routes require JWT auth (user must be logged in to manage keys)
router.post("/", requireAuth, generateApiKey);
router.get("/", requireAuth, listApiKeys);
router.delete("/:id", requireAuth, revokeApiKey);

export default router;
