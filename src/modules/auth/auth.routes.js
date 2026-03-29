'use strict';
const express    = require('express');
const cors       = require('cors');
const passport   = require('passport');
const { requireAuth } = require('./auth.middleware.js');

const {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
  markOnboarded,
  promoteToAdmin,
  updateProfile,
} = require('./auth.controller.js');

const { googleCallback } = require('./google.callback.js');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const isGoogleAuthEnabled =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET;

const router = express.Router();

// Apply CORS to all auth routes
router.use(cors());

/* =========================
   CURRENT USER PROFILE
========================= */
router.get('/me', requireAuth, getMe);
router.patch('/profile', requireAuth, updateProfile);

/* =========================
   MARK USER AS ONBOARDED
========================= */
router.post('/mark-onboarded', requireAuth, markOnboarded);

/* =========================
   PROMOTE USER TO ADMIN
========================= */
router.post('/promote-admin', promoteToAdmin);

/* =========================
   EMAIL / PASSWORD AUTH
========================= */
router.post('/register', register);
router.post('/login', login);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

/* =========================
   GOOGLE OAUTH
========================= */
if (isGoogleAuthEnabled) {
  // Load the Google strategy only when credentials are present
  require('./google.strategy.js');

  // Step 1: Redirect user to Google
  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false
    })
  );

  // Step 2: Google callback
  router.get(
    '/google/callback',
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${FRONTEND_URL}/login`
    }),
    googleCallback
  );

  console.log('✅ Google OAuth routes enabled');
} else {
  console.warn('⚠️  Google OAuth routes disabled (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
}

module.exports = router;
