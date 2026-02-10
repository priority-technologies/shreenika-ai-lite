import express from "express";
import passport from "passport";
import { requireAuth } from "./auth.middleware.js";

import {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe
} from "./auth.controller.js";

import { googleCallback } from "./google.callback.js";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const isGoogleAuthEnabled =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET;

const router = express.Router();

/* =========================
   CURRENT USER PROFILE
========================= */
router.get("/me", requireAuth, getMe);

/* =========================
   EMAIL / PASSWORD AUTH
========================= */

// Register with email + password
router.post("/register", register);

// Login with email + password
router.post("/login", login);

// Verify email via token
router.get("/verify-email/:token", verifyEmail);

// Forgot password
router.post("/forgot-password", forgotPassword);

// Reset password
router.post("/reset-password", resetPassword);

/* =========================
   GOOGLE OAUTH
========================= */

if (isGoogleAuthEnabled) {
  // Step 1: Redirect user to Google
  router.get(
    "/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false
    })
  );

  // Step 2: Google callback
  router.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${FRONTEND_URL}/login`
    }),
    googleCallback
  );

  console.log("✅ Google OAuth routes enabled");
} else {
  console.warn("⚠️ Google OAuth routes disabled (missing env vars)");
}

export default router;
