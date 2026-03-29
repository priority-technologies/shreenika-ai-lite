'use strict';
const express      = require('express');
const { requireAuth } = require('../auth/auth.middleware.js');

const {
  getVoipProvider,
  addVoipProvider,
  getVoipNumbers,
  syncVoipNumbers,
  assignNumberToAgent,
  unassignNumber,
  releaseNumber,
  getAvailableNumbers,
  purchaseNumber,
  deleteVoipNumber,
  setupVoipForRegistration,
  cleanupVoipForUser,
} = require('./voip.controller.js');

const router = express.Router();

// All VOIP routes require authentication
router.use(requireAuth);

// ── Provider ──────────────────────────────────────────
router.get('/provider',           getVoipProvider);
router.post('/provider',          addVoipProvider);

// ── Numbers ───────────────────────────────────────────
router.get('/numbers',            getVoipNumbers);
router.post('/numbers/sync',      syncVoipNumbers);
router.post('/numbers/assign',    assignNumberToAgent);
router.post('/numbers/unassign',  unassignNumber);
router.post('/numbers/release',   releaseNumber);
router.get('/numbers/available',  getAvailableNumbers);
router.post('/numbers/purchase',  purchaseNumber);
router.delete('/numbers/:numberId', deleteVoipNumber);

// ── Onboarding ────────────────────────────────────────
router.post('/setup-registration', setupVoipForRegistration);

// ── Dev / Testing ─────────────────────────────────────
router.post('/cleanup', cleanupVoipForUser);

module.exports = router;
