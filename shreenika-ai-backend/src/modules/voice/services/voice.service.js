/**
 * voice.service.js
 * ============================================================
 * Voice Service - Orchestrates entire voice agent system
 * Manages state machine, database, analytics
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

const VoiceAgentStateMachine = require('../state-machine/VoiceAgentStateMachine');
const GeminiLiveClient = require('../clients/GeminiLiveClient');
const SmartAgent = require('../../models/SmartAgent.model');
const SmartCallRecord = require('../../models/SmartCallRecord.model');
const { v4: uuidv4 } = require('uuid');

class VoiceService {
  constructor() {
    this.activeStateMachines = new Map(); // callId → stateMachine
    this.geminiClients = new Map(); // callId → geminiClient
  }

  /**
   * Initialize a new voice call
   */
  async initializeCall(agentId, userId) {
    console.log(`\n🚀 [VoiceService] Initializing call`);
    console.log(`   agentId: ${agentId}`);
    console.log(`   userId: ${userId}`);

    try {
      // Generate unique call ID
      const callId = `call_${Date.now()}_${uuidv4().substring(0, 8)}`;
      console.log(`   callId: ${callId}`);

      // Load agent configuration
      const agent = await SmartAgent.findById(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      console.log(`   Agent: ${agent.agentName}`);

      // Initialize Gemini Live client
      const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!geminiApiKey) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set');
      }

      const geminiClient = new GeminiLiveClient(geminiApiKey);

      // Initialize state machine
      const stateMachine = new VoiceAgentStateMachine(agent.toObject(), geminiClient);
      await stateMachine.initialize(callId);

      // Store references
      this.activeStateMachines.set(callId, stateMachine);
      this.geminiClients.set(callId, geminiClient);

      // Create call record in database
      const callRecord = new SmartCallRecord({
        callId: callId,
        agentId: agentId,
        userId: userId,
        accountId: agent.userId, // Assuming user owns account
        phoneNumber: 'unknown', // Will be updated later
        direction: 'Outbound',
        startTime: new Date(),
        turns: []
      });

      await callRecord.save();
      console.log(`   ✅ Call initialized successfully`);

      return {
        callId: callId,
        agentId: agentId,
        status: 'active',
        message: 'Ready to receive audio'
      };

    } catch (error) {
      console.error(`   ❌ Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process incoming audio chunk
   */
  async processAudioChunk(callId, audioBuffer) {
    try {
      const stateMachine = this.activeStateMachines.get(callId);
      if (!stateMachine) {
        throw new Error(`Call not found: ${callId}`);
      }

      // Process audio through state machine
      if (stateMachine.currentState === 'LISTENING') {
        stateMachine.onAudioChunk(audioBuffer);
      }

    } catch (error) {
      console.error(`❌ [${callId}] Error processing audio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect silence and trigger thinking
   */
  async onSilenceDetected(callId) {
    try {
      const stateMachine = this.activeStateMachines.get(callId);
      if (!stateMachine) {
        throw new Error(`Call not found: ${callId}`);
      }

      stateMachine.onSilenceDetected();

    } catch (error) {
      console.error(`❌ [${callId}] Error on silence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle user interruption
   */
  async onUserInterruption(callId) {
    try {
      const stateMachine = this.activeStateMachines.get(callId);
      if (!stateMachine) {
        throw new Error(`Call not found: ${callId}`);
      }

      stateMachine.onUserInterruption();

    } catch (error) {
      console.error(`❌ [${callId}] Error on interruption: ${error.message}`);
      throw error;
    }
  }

  /**
   * End call and save analytics
   */
  async endCall(callId) {
    console.log(`\n🏁 [${callId}] Ending call`);

    try {
      const stateMachine = this.activeStateMachines.get(callId);
      if (!stateMachine) {
        throw new Error(`Call not found: ${callId}`);
      }

      // Get call statistics
      const callStats = await stateMachine.endCall();

      // Update call record in database
      const callRecord = await SmartCallRecord.findOne({ callId: callId });
      if (callRecord) {
        callRecord.endTime = new Date();
        callRecord.duration = callStats.duration;
        callRecord.totalTurns = callStats.turns;
        callRecord.conversationTranscript = this._buildTranscript(callStats.conversationHistory);

        // Add turn details
        callRecord.turns = callStats.conversationHistory.map(turn => ({
          turnNumber: turn.turnNumber,
          userMessage: turn.userMessage,
          agentResponse: '(audio)',
          detectedStage: turn.stage,
          detectedProfile: turn.profile,
          detectedObjections: turn.objections,
          appliedPrinciple: turn.principle,
          userSentiment: turn.sentiment,
          timestamp: turn.timestamp
        }));

        // Calculate metrics
        this._calculateMetrics(callRecord, callStats);

        await callRecord.save();
        console.log(`   ✅ Call record saved`);
      }

      // Cleanup
      this.activeStateMachines.delete(callId);
      this.geminiClients.delete(callId);

      console.log(`   Duration: ${callStats.duration.toFixed(2)}s`);
      console.log(`   Turns: ${callStats.turns}`);
      console.log(`   ✅ Call ended successfully`);

      return callStats;

    } catch (error) {
      console.error(`   ❌ Error ending call: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callId) {
    try {
      const stateMachine = this.activeStateMachines.get(callId);
      if (!stateMachine) {
        return null;
      }

      return stateMachine.getStateInfo();

    } catch (error) {
      console.error(`❌ [${callId}] Error getting status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get call history for a user
   */
  async getCallHistory(userId, limit = 50) {
    try {
      const calls = await SmartCallRecord
        .find({ userId: userId })
        .sort({ startTime: -1 })
        .limit(limit)
        .populate('agentId', 'agentName');

      return calls;

    } catch (error) {
      console.error(`❌ Error getting call history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get call analytics
   */
  async getCallAnalytics(callId) {
    try {
      const callRecord = await SmartCallRecord.findOne({ callId: callId });
      if (!callRecord) {
        throw new Error(`Call not found: ${callId}`);
      }

      return {
        callId: callRecord.callId,
        duration: callRecord.duration,
        totalTurns: callRecord.totalTurns,
        outcome: callRecord.outcome,
        sentiment: {
          initial: callRecord.initialSentiment,
          final: callRecord.finalSentiment,
          average: callRecord.averageSentiment,
          trend: callRecord.sentimentTrend
        },
        principles: callRecord.principlesUsed,
        objections: callRecord.objectionsTouched,
        fillers: callRecord.totalFillers,
        metrics: callRecord.metrics
      };

    } catch (error) {
      console.error(`❌ Error getting analytics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build transcript from conversation history
   */
  _buildTranscript(history) {
    return history
      .map(turn => `Customer (Turn ${turn.turnNumber}): ${turn.userMessage}`)
      .join('\n');
  }

  /**
   * Calculate call metrics
   */
  _calculateMetrics(callRecord, callStats) {
    try {
      if (callRecord.turns && callRecord.turns.length > 0) {
        // Calculate sentiment trend
        const sentiments = callRecord.turns.map(t => t.userSentiment).filter(s => s !== undefined);
        if (sentiments.length > 1) {
          const firstSentiment = sentiments[0];
          const lastSentiment = sentiments[sentiments.length - 1];

          callRecord.initialSentiment = firstSentiment;
          callRecord.finalSentiment = lastSentiment;
          callRecord.averageSentiment = sentiments.reduce((a, b) => a + b) / sentiments.length;

          if (lastSentiment > firstSentiment) {
            callRecord.sentimentTrend = 'Improving';
          } else if (lastSentiment < firstSentiment) {
            callRecord.sentimentTrend = 'Declining';
          } else {
            callRecord.sentimentTrend = 'Stable';
          }
        }

        // Calculate other metrics
        callRecord.totalFillers = callRecord.fillersUsed ? callRecord.fillersUsed.length : 0;

        // Collect principles used
        const principles = new Set();
        callRecord.turns.forEach(turn => {
          if (turn.appliedPrinciple) {
            principles.add(turn.appliedPrinciple);
          }
        });
        callRecord.principlesUsed = Array.from(principles);

        // Collect objections
        const objections = new Set();
        callRecord.turns.forEach(turn => {
          if (turn.detectedObjections && Array.isArray(turn.detectedObjections)) {
            turn.detectedObjections.forEach(obj => objections.add(obj));
          }
        });
        callRecord.objectionsTouched = Array.from(objections);
      }

    } catch (error) {
      console.warn(`Warning calculating metrics: ${error.message}`);
    }
  }

  /**
   * Get active calls count
   */
  getActiveCallsCount() {
    return this.activeStateMachines.size;
  }

  /**
   * Get active call IDs
   */
  getActiveCallIds() {
    return Array.from(this.activeStateMachines.keys());
  }
}

module.exports = new VoiceService();
