import express from 'express';
import * as testAgentController from './test-agent.controller.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/test-agent/start
 * Initialize a test agent session
 * Body: { agentId: string }
 * Response: { success, sessionId, wsUrl, maxDuration }
 */
router.post('/start', authenticateToken, testAgentController.startTestAgent);

/**
 * POST /api/test-agent/:sessionId/end
 * End a test agent session and log usage
 * Response: { success, durationSeconds, cost }
 */
router.post('/:sessionId/end', authenticateToken, testAgentController.endTestAgent);

export default router;
