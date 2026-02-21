/**
 * voice.controller.js
 * ============================================================
 * Controller for SMART Voice Agent API endpoints
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

const VoiceService = require('../modules/voice/services/voice.service');
const SmartAgent = require('../models/SmartAgent.model');
const SmartCallRecord = require('../models/SmartCallRecord.model');
const { v4: uuidv4 } = require('uuid');

class VoiceController {
  /**
   * POST /voice/call/init
   * Initialize a new voice call
   */
  static async initializeCall(req, res) {
    try {
      const { agentId } = req.body;
      const userId = req.user._id;

      if (!agentId) {
        return res.status(400).json({
          success: false,
          error: 'agentId is required'
        });
      }

      // Verify agent exists and belongs to user
      const agent = await SmartAgent.findById(agentId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
      }

      // Initialize call
      const result = await VoiceService.initializeCall(agentId, userId);

      res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error(`Initialize Call Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/call/:callId/status
   * Get call status
   */
  static async getCallStatus(req, res) {
    try {
      const { callId } = req.params;

      const status = await VoiceService.getCallStatus(callId);
      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }

      res.status(200).json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error(`Get Call Status Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /voice/call/:callId/audio
   * Process audio chunk
   */
  static async processAudioChunk(req, res) {
    try {
      const { callId } = req.params;
      const { audioBuffer } = req.body;

      if (!audioBuffer) {
        return res.status(400).json({
          success: false,
          error: 'audioBuffer is required'
        });
      }

      await VoiceService.processAudioChunk(callId, Buffer.from(audioBuffer, 'base64'));

      res.status(200).json({
        success: true,
        message: 'Audio processed'
      });

    } catch (error) {
      console.error(`Process Audio Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /voice/call/:callId/end
   * End call
   */
  static async endCall(req, res) {
    try {
      const { callId } = req.params;

      const stats = await VoiceService.endCall(callId);

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error(`End Call Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/call/:callId/analytics
   * Get call analytics
   */
  static async getCallAnalytics(req, res) {
    try {
      const { callId } = req.params;

      const analytics = await VoiceService.getCallAnalytics(callId);

      res.status(200).json({
        success: true,
        data: analytics
      });

    } catch (error) {
      console.error(`Get Analytics Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/history
   * Get user's call history
   */
  static async getCallHistory(req, res) {
    try {
      const userId = req.user._id;
      const { limit = 50 } = req.query;

      const history = await VoiceService.getCallHistory(userId, parseInt(limit));

      res.status(200).json({
        success: true,
        data: history
      });

    } catch (error) {
      console.error(`Get History Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/history/:agentId
   * Get agent's call history
   */
  static async getAgentCallHistory(req, res) {
    try {
      const { agentId } = req.params;
      const { limit = 50 } = req.query;

      const calls = await SmartCallRecord
        .find({ agentId: agentId })
        .sort({ startTime: -1 })
        .limit(parseInt(limit));

      res.status(200).json({
        success: true,
        data: calls
      });

    } catch (error) {
      console.error(`Get Agent History Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /voice/test-agent/start
   * Start test agent session
   */
  static async startTestAgent(req, res) {
    try {
      const { agentId } = req.body;
      const userId = req.user._id;

      if (!agentId) {
        return res.status(400).json({
          success: false,
          error: 'agentId is required'
        });
      }

      // Initialize test call
      const result = await VoiceService.initializeCall(agentId, userId);

      res.status(200).json({
        success: true,
        data: {
          ...result,
          type: 'test'
        }
      });

    } catch (error) {
      console.error(`Start Test Agent Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /voice/test-agent/:callId/audio
   * Send audio to test agent
   */
  static async testAgentAudio(req, res) {
    try {
      const { callId } = req.params;
      const { audioBuffer } = req.body;

      await VoiceService.processAudioChunk(callId, Buffer.from(audioBuffer, 'base64'));

      // Simulate response
      const status = await VoiceService.getCallStatus(callId);

      res.status(200).json({
        success: true,
        data: {
          status: status,
          message: 'Audio processed'
        }
      });

    } catch (error) {
      console.error(`Test Agent Audio Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /voice/test-agent/:callId/end
   * End test agent session
   */
  static async endTestAgent(req, res) {
    try {
      const { callId } = req.params;

      const stats = await VoiceService.endCall(callId);

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error(`End Test Agent Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/agents/:agentId
   * Get agent configuration
   */
  static async getAgentConfig(req, res) {
    try {
      const { agentId } = req.params;
      const userId = req.user._id;

      const agent = await SmartAgent.findById(agentId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
      }

      res.status(200).json({
        success: true,
        data: agent
      });

    } catch (error) {
      console.error(`Get Agent Config Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PUT /voice/agents/:agentId
   * Update agent configuration
   */
  static async updateAgentConfig(req, res) {
    try {
      const { agentId } = req.params;
      const updates = req.body;

      const agent = await SmartAgent.findByIdAndUpdate(
        agentId,
        { ...updates, updatedAt: new Date() },
        { new: true }
      );

      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
      }

      res.status(200).json({
        success: true,
        data: agent
      });

    } catch (error) {
      console.error(`Update Agent Config Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/agents
   * List agents
   */
  static async listAgents(req, res) {
    try {
      const userId = req.user._id;

      const agents = await SmartAgent
        .find({ userId: userId, status: 'Active' })
        .select('agentName agentRole primaryLanguage status statistics');

      res.status(200).json({
        success: true,
        data: agents
      });

    } catch (error) {
      console.error(`List Agents Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /voice/agents
   * Create agent
   */
  static async createAgent(req, res) {
    try {
      const userId = req.user._id;
      const agentData = req.body;

      const agent = new SmartAgent({
        ...agentData,
        userId: userId,
        accountId: userId,
        status: 'Active'
      });

      await agent.save();

      res.status(201).json({
        success: true,
        data: agent
      });

    } catch (error) {
      console.error(`Create Agent Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /voice/agents/:agentId/test
   * Test agent with sample conversation
   */
  static async testAgent(req, res) {
    try {
      const { agentId } = req.params;
      const userId = req.user._id;

      // Initialize test call
      const callResult = await VoiceService.initializeCall(agentId, userId);

      res.status(200).json({
        success: true,
        data: {
          ...callResult,
          message: 'Test call initialized. Send audio via /voice/test-agent/:callId/audio'
        }
      });

    } catch (error) {
      console.error(`Test Agent Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/stats
   * Get system statistics
   */
  static async getSystemStats(req, res) {
    try {
      const userId = req.user._id;

      const [totalCalls, activeCalls, totalAgents] = await Promise.all([
        SmartCallRecord.countDocuments({ userId: userId }),
        Promise.resolve(VoiceService.getActiveCallsCount()),
        SmartAgent.countDocuments({ userId: userId, status: 'Active' })
      ]);

      // Calculate average duration
      const callStats = await SmartCallRecord.aggregate([
        { $match: { userId: userId } },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
            totalDuration: { $sum: '$duration' }
          }
        }
      ]);

      const avgDuration = callStats[0]?.avgDuration || 0;
      const totalDuration = callStats[0]?.totalDuration || 0;

      res.status(200).json({
        success: true,
        data: {
          totalCalls: totalCalls,
          activeCalls: activeCalls,
          totalAgents: totalAgents,
          averageCallDuration: avgDuration.toFixed(2),
          totalDuration: totalDuration.toFixed(2)
        }
      });

    } catch (error) {
      console.error(`Get Stats Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /voice/calls/active
   * Get active calls
   */
  static async getActiveCalls(req, res) {
    try {
      const activeCalls = VoiceService.getActiveCallIds();

      const statuses = await Promise.all(
        activeCalls.map(callId => VoiceService.getCallStatus(callId))
      );

      res.status(200).json({
        success: true,
        data: {
          count: activeCalls.length,
          calls: statuses
        }
      });

    } catch (error) {
      console.error(`Get Active Calls Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = VoiceController;
