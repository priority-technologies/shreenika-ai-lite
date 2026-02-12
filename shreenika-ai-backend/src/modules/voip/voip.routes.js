import express from "express";
import {
  getVoipProvider,
  addVoipProvider,
  getVoipNumbers,
  syncVoipNumbers,
  assignNumberToAgent,
  unassignNumber,
  releaseNumber,
  getAvailableNumbers,
  purchaseNumber,
  setupVoipForRegistration,
} from "./voip.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";

const router = express.Router();

// Registration VOIP setup - requires auth but happens during onboarding
router.post("/setup-registration", requireAuth, setupVoipForRegistration);

// All other routes require authentication
router.use(requireAuth);

// Provider management
router.get("/provider", getVoipProvider);
router.post("/provider", addVoipProvider);

// Number management
router.get("/numbers", getVoipNumbers);
router.post("/numbers/sync", syncVoipNumbers);
router.post("/numbers/assign", assignNumberToAgent);
router.post("/numbers/unassign", unassignNumber);
router.post("/numbers/release", releaseNumber);

// Number purchasing
router.get("/numbers/available", getAvailableNumbers);
router.post("/numbers/purchase", purchaseNumber);

export default router;
