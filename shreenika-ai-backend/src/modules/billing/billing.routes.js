import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  getBillingStatus,
  getCurrentUsage,
  getInvoices,
  purchaseAddOn,
  updatePlan,
  cancelSubscription
} from "./billing.controller.js";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// GET routes
router.get("/status", getBillingStatus);
router.get("/usage", getCurrentUsage);
router.get("/invoices", getInvoices);

// POST/PUT routes
router.post("/addon", purchaseAddOn);
router.put("/plan", updatePlan);
router.post("/cancel", cancelSubscription);

export default router;
