import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { runAgentPrompt } from "./ai.controller.js";

const router = express.Router();

router.use(requireAuth);
router.post("/run", runAgentPrompt);

export default router;
