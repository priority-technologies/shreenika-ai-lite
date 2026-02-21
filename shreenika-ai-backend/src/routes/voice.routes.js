/**
 * voice.routes.js
 * ============================================================
 * REST API Routes for SMART Voice Agent System
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

const express = require('express');
const router = express.Router();
const VoiceController = require('../controllers/voice.controller');
const auth = require('../middleware/auth.middleware'); // Assuming auth middleware exists

/**
 * POST /voice/call/init
 * Initialize a new voice call
 */
router.post('/call/init', auth, VoiceController.initializeCall);

/**
 * GET /voice/call/:callId/status
 * Get status of active call
 */
router.get('/call/:callId/status', auth, VoiceController.getCallStatus);

/**
 * POST /voice/call/:callId/audio
 * Send audio chunk to voice agent (WebSocket preferred)
 */
router.post('/call/:callId/audio', auth, VoiceController.processAudioChunk);

/**
 * POST /voice/call/:callId/end
 * End voice call and save analytics
 */
router.post('/call/:callId/end', auth, VoiceController.endCall);

/**
 * GET /voice/call/:callId/analytics
 * Get call analytics and metrics
 */
router.get('/call/:callId/analytics', auth, VoiceController.getCallAnalytics);

/**
 * GET /voice/history
 * Get call history for authenticated user
 */
router.get('/history', auth, VoiceController.getCallHistory);

/**
 * GET /voice/history/:agentId
 * Get call history for specific agent
 */
router.get('/history/:agentId', auth, VoiceController.getAgentCallHistory);

/**
 * POST /voice/test-agent/start
 * Start test agent for testing voice settings
 */
router.post('/test-agent/start', auth, VoiceController.startTestAgent);

/**
 * POST /voice/test-agent/:callId/audio
 * Send audio to test agent
 */
router.post('/test-agent/:callId/audio', auth, VoiceController.testAgentAudio);

/**
 * POST /voice/test-agent/:callId/end
 * End test agent session
 */
router.post('/test-agent/:callId/end', auth, VoiceController.endTestAgent);

/**
 * GET /voice/agents/:agentId
 * Get agent configuration
 */
router.get('/agents/:agentId', auth, VoiceController.getAgentConfig);

/**
 * PUT /voice/agents/:agentId
 * Update agent configuration
 */
router.put('/agents/:agentId', auth, VoiceController.updateAgentConfig);

/**
 * GET /voice/agents
 * List all agents for user
 */
router.get('/agents', auth, VoiceController.listAgents);

/**
 * POST /voice/agents
 * Create new agent
 */
router.post('/agents', auth, VoiceController.createAgent);

/**
 * POST /voice/agents/:agentId/test
 * Test agent with sample conversation
 */
router.post('/agents/:agentId/test', auth, VoiceController.testAgent);

/**
 * GET /voice/stats
 * Get voice system statistics
 */
router.get('/stats', auth, VoiceController.getSystemStats);

/**
 * GET /voice/calls/active
 * Get all active calls
 */
router.get('/calls/active', auth, VoiceController.getActiveCalls);

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

module.exports = router;
