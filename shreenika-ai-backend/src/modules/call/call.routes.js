import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createCall,
  completeCall,
  listCalls,
  startCampaign,
  stopCampaign,
  redialCall,
  archiveCall,
} from "./call.controller.js";

const router = express.Router();

router.use(requireAuth);

// Campaign endpoints
router.post("/campaigns", startCampaign);
router.post("/campaigns/stop", stopCampaign);

// Call endpoints
router.get("/", listCalls);
router.post("/", createCall);
router.post("/:id/complete", completeCall);
router.post("/:id/redial", redialCall);
router.delete("/:id", archiveCall);

export default router;