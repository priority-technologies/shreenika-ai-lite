import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createCheckoutSession,
  stripeWebhook
} from "./stripe.controller.js";

const router = express.Router();

router.post("/checkout", requireAuth, createCheckoutSession);
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

export default router;
