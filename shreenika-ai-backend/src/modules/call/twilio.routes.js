import express from "express";
import {
  startOutboundCall,
  twilioVoice,
  twilioStatus,
  twilioAmdStatus,
  twilioRecordingStatus
} from "./twilio.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";

const router = express.Router();

router.post("/outbound", requireAuth, startOutboundCall);
router.post("/voice", twilioVoice);
router.post("/status", express.urlencoded({ extended: false }), twilioStatus);
router.post("/amd-status", express.urlencoded({ extended: false }), twilioAmdStatus);
router.post("/recording-status", express.urlencoded({ extended: false }), twilioRecordingStatus);

export default router;
