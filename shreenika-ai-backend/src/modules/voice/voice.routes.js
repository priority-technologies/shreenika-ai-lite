/**
 * Voice Routes
 * API endpoints for voice agent management
 */

import express from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  getAvailableVoices,
  getAvailableLanguages,
  updateAgentVoiceSettings,
  testVoicePreview,
  getAgentVoiceSettings,
  recommendVoicesHandler,
  validateVoiceSettingsHandler
} from './voice.controller.js';

const router = express.Router();

/**
 * Public endpoints (no auth required)
 */

// Get all available voice profiles
router.get('/voices/available', getAvailableVoices);

// Get all available languages
router.get('/languages/available', getAvailableLanguages);

// Get voice recommendations
router.post('/voices/recommend', recommendVoicesHandler);

// Validate voice settings
router.post('/validate-settings', validateVoiceSettingsHandler);

/**
 * Authenticated endpoints (require auth)
 */

// Get agent voice settings
router.get('/agent/:agentId/settings', requireAuth, getAgentVoiceSettings);

// Update agent voice settings
router.put('/agent/:agentId/settings', requireAuth, updateAgentVoiceSettings);

// Test voice preview
router.post('/agent/:agentId/preview', requireAuth, testVoicePreview);

export default router;
