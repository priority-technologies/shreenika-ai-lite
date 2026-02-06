import express from "express";
import {
  startOutboundCall,
  twilioVoice,
  twilioStatus
} from "./twilio.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";

const router = express.Router();

router.post("/outbound", requireAuth, startOutboundCall);
router.post("/voice", twilioVoice);
router.post("/status", express.urlencoded({ extended: false }), twilioStatus);

export default router;
