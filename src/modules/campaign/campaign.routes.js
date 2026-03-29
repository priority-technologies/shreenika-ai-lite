'use strict';

/**
 * Campaign Routes — CommonJS
 * 2026-03-22
 */

const express = require('express');
const { requireAuth } = require('../auth/auth.middleware.js');
const { requireMinutes } = require('../billing/plan-enforce.middleware.js');
const {
  createCampaign,
  startCampaign,
  getCampaignStatus,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  listCampaigns,
  getCampaignDetails,
  deleteCampaign,
} = require('./campaign.controller.js');

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get('/',                  listCampaigns);
router.post('/',                 createCampaign);
router.get('/:campaignId',       getCampaignDetails);
router.delete('/:campaignId',    deleteCampaign);

// ── Real-time status ──────────────────────────────────────────────────────────
router.get('/:campaignId/status', getCampaignStatus);

// ── Execution control ─────────────────────────────────────────────────────────
router.post('/:campaignId/start',  requireMinutes, startCampaign);  // Blocked if no minutes
router.post('/:campaignId/pause',  pauseCampaign);   // Soft pause — resumable
router.post('/:campaignId/resume', requireMinutes, resumeCampaign); // Also check on resume
router.post('/:campaignId/stop',   stopCampaign);    // Hard stop — permanent cancel

module.exports = router;
