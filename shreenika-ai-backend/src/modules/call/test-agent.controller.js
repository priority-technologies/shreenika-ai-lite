import Agent from '../agent/agent.model.js';
import Usage from '../usage/usage.model.js';

// In-memory storage for test agent sessions (in production, use Redis)
export const testAgentSessions = new Map();

/**
 * Initialize test agent session
 * Returns WebSocket URL for browser to connect
 *
 * POST /test-agent/start
 * Body: { agentId: string }
 * Response: { success, sessionId, wsUrl, maxDuration }
 */
export const startTestAgent = async (req, res) => {
  try {
    const { agentId } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    // Fetch agent and verify ownership
    const agent = await Agent.findOne({ _id: agentId, userId });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or not owned by user' });
    }

    // Validate agent has required config
    if (!agent.name) {
      return res.status(400).json({ error: 'Agent must have a name configured' });
    }

    if (!agent.voiceProfile || !agent.voiceProfile.voiceId) {
      return res.status(400).json({ error: 'Agent must have a voice configured' });
    }

    // Generate unique session ID
    const sessionId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create WebSocket URL
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const wsUrl = `${baseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/test-agent/${sessionId}`;

    // Calculate 40-60 voice configuration ratio
    // 40%: Characteristics (traits) and Emotions
    // 60%: Speech Settings (voiceSpeed, responsiveness, interruptionSensitivity, backgroundNoise)
    const voiceConfig = {
      characteristics40: {
        traits: agent.characteristics || [],
        emotions: agent.speechSettings?.emotions || 0.5,
        weight: 0.4
      },
      speechSettings60: {
        voiceSpeed: agent.speechSettings?.voiceSpeed || 1.0,
        responsiveness: agent.speechSettings?.responsiveness || 0.5,
        interruptionSensitivity: agent.speechSettings?.interruptionSensitivity || 0.5,
        backgroundNoise: agent.speechSettings?.backgroundNoise || 'office',
        weight: 0.6
      }
    };

    // Store session metadata with expiry
    const maxDurationMs = 5 * 60 * 1000; // 5 minutes
    testAgentSessions.set(sessionId, {
      agentId: agent._id.toString(),
      userId: userId.toString(),
      agentName: agent.name,
      rolePrompt: agent.prompt,
      welcomeMessage: agent.welcomeMessage,
      voiceConfig: voiceConfig,
      startedAt: Date.now(),
      maxDuration: maxDurationMs,
      // Auto-cleanup after expiry + 1 minute buffer
      expiryTimer: setTimeout(() => {
        console.log(`⏰ Test Agent Session ${sessionId} cleanup timer: Removing expired session`);
        testAgentSessions.delete(sessionId);
      }, maxDurationMs + 60000)
    });

    console.log(`🎙️  Test Agent: Session created - ${sessionId}`);
    console.log(`   Agent: ${agent.name} (${agentId})`);
    console.log(`   User: ${userId}`);
    console.log(`   Max Duration: 5 minutes`);

    res.json({
      success: true,
      sessionId,
      wsUrl,
      maxDuration: 300, // seconds
      agent: {
        id: agent._id,
        name: agent.name,
        voice: agent.voiceProfile?.displayName || 'Default Voice'
      },
      rolePrompt: agent.prompt,
      welcomeMessage: agent.welcomeMessage,
      voiceConfig: voiceConfig
    });
  } catch (error) {
    console.error('❌ Test Agent: Start failed:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * End test agent session and log usage
 *
 * POST /test-agent/:sessionId/end
 * Response: { success, durationSeconds }
 */
export const endTestAgent = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Validate input
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = testAgentSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or already ended' });
    }

    // Verify user ownership
    if (session.userId !== userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized - session belongs to another user' });
    }

    // Calculate actual duration
    const durationMs = Date.now() - session.startedAt;
    const durationSeconds = Math.floor(durationMs / 1000);

    console.log(`🏁 Test Agent: Session ended - ${sessionId}`);
    console.log(`   Duration: ${durationSeconds} seconds`);
    console.log(`   Agent: ${session.agentName}`);

    // Log usage (charge user for API calls)
    try {
      await Usage.create({
        userId,
        agentId: session.agentId,
        type: 'test-agent',
        durationSeconds,
        cost: calculateTestAgentCost(durationSeconds),
        metadata: {
          sessionId,
          agentName: session.agentName
        },
        timestamp: new Date()
      });

      console.log(`💰 Test Agent: Usage logged - ${durationSeconds}s at ${calculateTestAgentCost(durationSeconds)} cost`);
    } catch (usageError) {
      console.error('⚠️  Test Agent: Failed to log usage:', usageError.message);
      // Don't fail the request if usage logging fails
    }

    // Clean up session
    clearTimeout(session.expiryTimer);
    testAgentSessions.delete(sessionId);

    res.json({
      success: true,
      durationSeconds,
      cost: calculateTestAgentCost(durationSeconds),
      message: `Test completed in ${formatDuration(durationSeconds)}`
    });
  } catch (error) {
    console.error('❌ Test Agent: End failed:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Calculate cost for test agent based on Google API pricing
 * Rough estimate: $0.0001 per second (0.1 cents per second)
 * This is approximate - adjust based on actual Google API costs
 */
export function calculateTestAgentCost(durationSeconds) {
  const costPerSecond = 0.0001; // $0.0001 per second
  return parseFloat((durationSeconds * costPerSecond).toFixed(4));
}

/**
 * Format duration for display
 */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
