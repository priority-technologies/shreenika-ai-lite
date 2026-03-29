import express from "express";
import {
  createAgent,
  getAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  activateAgent
} from "./agent.controller.js";

import { requireAuth, requireVerifiedEmail } from "../auth/auth.middleware.js";
import { enforceUsageLimits } from "../billing/billing.controller.js";
import { checkAgentLimit } from "../../middlewares/checkAgentLimit.js";

const router = express.Router();

/**
 * Execution order:
 * 1. requireAuth → sets req.user
 * 2. requireVerifiedEmail → ensures verified user
 * 3. checkAgentLimit → enforces plan-based agent limits
 * 4. enforceUsageLimits → billing guard
 * 5. controller
 */

// All routes require authentication
router.use(requireAuth);

// Create agent
router.post(
  "/",
  requireVerifiedEmail,
  checkAgentLimit,
  enforceUsageLimits,
  createAgent
);

// Activate agent
router.post(
  "/:id/activate",
  requireVerifiedEmail,
  activateAgent
);

// Get all agents
router.get("/", getAgents);

// Single agent routes
router.route("/:id")
  .get(getAgentById)
  .put(requireVerifiedEmail, enforceUsageLimits, updateAgent)
  .delete(deleteAgent);

export default router;
