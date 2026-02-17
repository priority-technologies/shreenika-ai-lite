import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createCall,
  completeCall,
  listCalls,
  startCampaign,
  stopCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaign,
  getCampaignLogs,
  listCampaigns,
  redialCall,
  archiveCall,
} from "./call.controller.js";

const router = express.Router();

router.use(requireAuth);

// Campaign endpoints
router.get("/campaigns", listCampaigns);
router.post("/campaigns", startCampaign);
router.get("/campaigns/:id", getCampaign);
router.get("/campaigns/:id/logs", getCampaignLogs);
router.post("/campaigns/:id/pause", pauseCampaign);
router.post("/campaigns/:id/resume", resumeCampaign);
router.post("/campaigns/stop", stopCampaign);

// Call endpoints
router.get("/", listCalls);
router.post("/", createCall);
router.post("/:id/complete", completeCall);
router.post("/:id/redial", redialCall);
router.delete("/:id", archiveCall);

export default router;