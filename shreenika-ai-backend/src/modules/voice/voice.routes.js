/**
 * voice.routes.js
 * ============================================================
 * REST API Routes for SMART Voice Agent System
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

import express from 'express';
import VoiceController from '../../controllers/voice.controller.js';
// TODO: Import auth middleware when project modules are fully ES6

const router = express.Router();

/**
 * POST /voice/call/init
 * Initialize a new voice call
 */
router.post('/call/init', VoiceController.initializeCall);

/**
 * GET /voice/call/:callId/status
 * Get status of active call
 */
router.get('/call/:callId/status', VoiceController.getCallStatus);

/**
 * POST /voice/call/:callId/audio
 * Send audio chunk to voice agent (WebSocket preferred)
 */
router.post('/call/:callId/audio', VoiceController.processAudioChunk);

/**
 * POST /voice/call/:callId/end
 * End voice call and save analytics
 */
router.post('/call/:callId/end', VoiceController.endCall);

/**
 * GET /voice/call/:callId/analytics
 * Get call analytics and metrics
 */
router.get('/call/:callId/analytics', VoiceController.getCallAnalytics);

/**
 * GET /voice/history
 * Get call history for authenticated user
 */
router.get('/history', VoiceController.getCallHistory);

/**
 * GET /voice/history/:agentId
 * Get call history for specific agent
 */
router.get('/history/:agentId', VoiceController.getAgentCallHistory);

/**
 * POST /voice/test-agent/start
 * Start test agent for testing voice settings
 */
router.post('/test-agent/start', VoiceController.startTestAgent);

/**
 * POST /voice/test-agent/:callId/audio
 * Send audio to test agent
 */
router.post('/test-agent/:callId/audio', VoiceController.testAgentAudio);

/**
 * POST /voice/test-agent/:callId/end
 * End test agent session
 */
router.post('/test-agent/:callId/end', VoiceController.endTestAgent);

/**
 * GET /voice/agents/:agentId
 * Get agent configuration
 */
router.get('/agents/:agentId', VoiceController.getAgentConfig);

/**
 * PUT /voice/agents/:agentId
 * Update agent configuration
 */
router.put('/agents/:agentId', VoiceController.updateAgentConfig);

/**
 * GET /voice/agents
 * List all agents for user
 */
router.get('/agents', VoiceController.listAgents);

/**
 * POST /voice/agents
 * Create new agent
 */
router.post('/agents', VoiceController.createAgent);

/**
 * POST /voice/agents/:agentId/test
 * Test agent with sample conversation
 */
router.post('/agents/:agentId/test', VoiceController.testAgent);

/**
 * GET /voice/stats
 * Get voice system statistics
 */
router.get('/stats', VoiceController.getSystemStats);

/**
 * GET /voice/calls/active
 * Get all active calls
 */
router.get('/calls/active', VoiceController.getActiveCalls);

/**
 * Error handler for voice routes
 */
router.use((error, req, res, next) => {
  console.error(`Voice Routes Error: ${error.message}`);

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

export default router;
