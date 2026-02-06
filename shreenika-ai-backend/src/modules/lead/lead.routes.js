import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createLead,
  listLeads,
  getLead,
  updateLead,
  deleteLead
} from "./lead.controller.js";

const router = express.Router();

router.use(requireAuth);

router.post("/", createLead);
router.get("/", listLeads);
router.get("/:id", getLead);
router.put("/:id", updateLead);
router.delete("/:id", deleteLead);

export default router;
