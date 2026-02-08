import express from "express";
import { requireApiKey } from "./apikey.middleware.js";

// Import existing controllers (reuse all existing logic)
import { getAgents, getAgentById } from "../agent/agent.controller.js";
import { startOutboundCall } from "../call/twilio.controller.js";
import { listCalls } from "../call/call.controller.js";
import {
  createContact,
  getContacts,
  updateContact,
  deleteContact,
} from "../contacts/contact.controller.js";
import { listKnowledge } from "../knowledge/knowledge.controller.js";
import { getCurrentUsage } from "../billing/billing.controller.js";
import { getBillingStatus } from "../billing/billing.controller.js";

const router = express.Router();

// All v1 routes require API key authentication
router.use(requireApiKey);

/* ========================================
   AGENTS
======================================== */
router.get("/agents", getAgents);
router.get("/agents/:id", getAgentById);

/* ========================================
   CALLS
======================================== */
router.post("/calls/outbound", startOutboundCall);
router.get("/calls", listCalls);

/* ========================================
   CONTACTS
======================================== */
router.get("/contacts", getContacts);
router.post("/contacts", createContact);
router.put("/contacts/:id", updateContact);
router.delete("/contacts/:id", deleteContact);

/* ========================================
   KNOWLEDGE BASE
======================================== */
router.get("/knowledge", listKnowledge);

/* ========================================
   USAGE & BILLING
======================================== */
router.get("/usage", getCurrentUsage);
router.get("/billing", getBillingStatus);

export default router;
