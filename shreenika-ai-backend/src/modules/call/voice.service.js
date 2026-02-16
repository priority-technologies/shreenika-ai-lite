/**
 * Voice Service
 *
 * Orchestrates real-time voice conversations between callers and AI agents.
 * Bridges Twilio Media Streams with Gemini Live API.
 *
 * Responsibilities:
 * - Load agent configuration
 * - Manage Gemini Live session
 * - Handle bidirectional audio
 * - Store conversation transcript
 * - Emit events for real-time updates
 */

import { EventEmitter } from 'events';
import Agent from '../agent/agent.model.js';
import Call from './call.model.js';
import Knowledge from '../knowledge/knowledge.model.js';
import { createGeminiLiveSession } from '../../config/google.live.client.js';
import { createVoiceCustomization } from '../voice/voice-customization.service.js';
import { io } from '../../server.js';

/**
 * VoiceService class
 * Manages a single voice conversation session
 */
export class VoiceService extends EventEmitter {
  constructor(callId, agentId, isTestMode = false, voiceConfig = null) {
    super();

    this.callId = callId;
    this.agentId = agentId;
    this.isTestMode = isTestMode;
    this.voiceConfig = voiceConfig; // Voice customization config

    this.agent = null;
    this.call = null;
    this.geminiSession = null;
    this.voiceCustomization = null; // Voice customization service

    this.conversationTurns = [];
    this.currentTurnText = '';
    this.isReady = false;
    this.isClosed = false;

    // Statistics
    this.audioChunksSent = 0;
    this.audioChunksReceived = 0;
    this.startTime = null;
  }

  /**
   * Initialize the voice service
   * Loads agent config and connects to Gemini Live
   */
  async initialize() {
    try {
      console.log(`🚀 Initializing voice service for call: ${this.callId}`);

      // Load agent configuration
      this.agent = await Agent.findById(this.agentId);
      if (!this.agent) {
        throw new Error(`Agent not found: ${this.agentId}`);
      }

      // Load call document (skip for test mode)
      if (!this.isTestMode) {
        this.call = await Call.findById(this.callId);
        if (!this.call) {
          throw new Error(`Call not found: ${this.callId}`);
        }
      } else {
        console.log(`🧪 Test Mode: Skipping Call document load`);
      }

      console.log(`📋 Agent loaded: ${this.agent.name}`);

      // Initialize voice customization service (40-60 ratio)
      this.voiceCustomization = await createVoiceCustomization(this.agent, this.voiceConfig);
      const voiceProfile = this.voiceCustomization.getAudioProfile();
      console.log(`🎨 Voice customization initialized:`);
      console.log(`   ├─ Characteristics: ${voiceProfile.characteristics.join(', ') || 'none'}`);
      console.log(`   ├─ Emotion Level: ${voiceProfile.emotions.toFixed(2)}`);
      console.log(`   ├─ Voice Speed: ${voiceProfile.voiceSpeed.toFixed(2)}x`);
      console.log(`   └─ Background Noise: ${voiceProfile.backgroundNoise}`);

      // Fetch knowledge documents from DB for this agent
      let knowledgeDocs = [];
      try {
        knowledgeDocs = await Knowledge.find({ agentId: this.agentId })
          .select('title rawText sourceType');
        if (knowledgeDocs.length > 0) {
          console.log(`📚 Knowledge loaded: ${knowledgeDocs.length} documents, ${knowledgeDocs.reduce((s, d) => s + (d.rawText?.length || 0), 0)} chars total`);
        }
      } catch (err) {
        console.warn('⚠️ Failed to load knowledge docs:', err.message);
      }

      // Create Gemini Live session with voice customization
      this.geminiSession = createGeminiLiveSession(this.agent, knowledgeDocs, this.voiceConfig);

      // Set up Gemini event handlers
      this._setupGeminiHandlers();

      // Connect to Gemini Live API
      await this.geminiSession.connect();

      this.startTime = Date.now();
      console.log(`✅ Voice service ready for call: ${this.callId}`);

    } catch (error) {
      console.error(`❌ Voice service initialization failed:`, error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set up Gemini Live event handlers
   * @private
   */
  _setupGeminiHandlers() {
    // Session ready
    this.geminiSession.on('ready', ({ sessionId }) => {
      console.log(`🎤 Gemini session ready: ${sessionId}`);
      this.isReady = true;

      // Send welcome message if configured
      if (this.agent.welcomeMessage) {
        console.log(`👋 Sending welcome message`);
        this.geminiSession.sendText(this.agent.welcomeMessage);
      }
    });

    // Audio response from Gemini
    this.geminiSession.on('audio', (audioBuffer) => {
      this.audioChunksReceived++;
      this.emit('audio', audioBuffer);
    });

    // Text response from Gemini (for transcript)
    this.geminiSession.on('text', (text) => {
      this.currentTurnText += text;
    });

    // Turn complete (agent finished speaking)
    this.geminiSession.on('turnComplete', () => {
      if (this.currentTurnText) {
        this._addConversationTurn('agent', this.currentTurnText);
        this.currentTurnText = '';
      }
    });

    // Interrupted (user started speaking)
    this.geminiSession.on('interrupted', () => {
      console.log(`🤚 User interrupted agent`);
      // Save partial turn if any
      if (this.currentTurnText) {
        this._addConversationTurn('agent', this.currentTurnText + ' [interrupted]');
        this.currentTurnText = '';
      }
    });

    // Tool call (for knowledge base)
    this.geminiSession.on('toolCall', async (toolCall) => {
      console.log(`🔧 Tool call:`, toolCall);
      // TODO: Handle knowledge base queries
    });

    // Error
    this.geminiSession.on('error', (error) => {
      console.error(`❌ Gemini session error:`, error.message);
      this.emit('error', error);
    });

    // Close
    this.geminiSession.on('close', ({ code, reason }) => {
      console.log(`🔌 Gemini session closed: ${code} ${reason}`);
      if (!this.isClosed) {
        this._handleSessionEnd();
      }
    });
  }

  /**
   * Send audio to Gemini Live
   * @param {Buffer} pcmBuffer - PCM 16-bit 16kHz audio
   */
  sendAudio(pcmBuffer) {
    if (!this.isReady || this.isClosed) {
      return;
    }

    this.audioChunksSent++;
    this.geminiSession.sendAudio(pcmBuffer);
  }

  /**
   * Send text message to Gemini
   * @param {string} text - Text message
   */
  sendText(text) {
    if (!this.isReady || this.isClosed) {
      return;
    }

    // Add user turn to transcript
    this._addConversationTurn('user', text);

    this.geminiSession.sendText(text);
  }

  /**
   * Add a conversation turn
   * @private
   * @param {string} role - 'agent' or 'user'
   * @param {string} content - Text content
   */
  _addConversationTurn(role, content) {
    const turn = {
      role,
      content,
      timestamp: new Date()
    };

    this.conversationTurns.push(turn);

    // Emit for real-time transcript
    this.emit('text', content, role);

    // Emit via Socket.IO for frontend updates
    if (this.call && this.call.userId) {
      io.emit('call:transcript', {
        userId: this.call.userId.toString(),
        callId: this.callId.toString(),
        turn
      });
    }

    // Log
    console.log(`💬 [${role.toUpperCase()}]: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
  }

  /**
   * Handle session end
   * @private
   */
  async _handleSessionEnd() {
    if (this.isClosed) return;
    this.isClosed = true;

    console.log(`📊 Session stats:`);
    console.log(`   - Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`);
    console.log(`   - Audio chunks sent: ${this.audioChunksSent}`);
    console.log(`   - Audio chunks received: ${this.audioChunksReceived}`);
    console.log(`   - Conversation turns: ${this.conversationTurns.length}`);

    // Save conversation turns to call document
    try {
      await this._saveTranscript();
    } catch (error) {
      console.error(`❌ Failed to save transcript:`, error.message);
    }

    this.emit('close');
  }

  /**
   * Save transcript to database
   * @private
   */
  async _saveTranscript() {
    if (!this.call || this.conversationTurns.length === 0) {
      return;
    }

    // Build formatted transcript
    const transcript = this.conversationTurns
      .map(turn => `${turn.role === 'agent' ? 'Agent' : 'Lead'}: ${turn.content}`)
      .join('\n');

    // Update call with transcript and conversation turns
    await Call.findByIdAndUpdate(this.callId, {
      conversationTurns: this.conversationTurns,
      transcript,
      aiProcessed: false // Will be processed by call.processor.js for summary/sentiment
    });

    console.log(`💾 Transcript saved for call: ${this.callId}`);
  }

  /**
   * Close the voice service
   */
  async close() {
    if (this.isClosed) return;

    console.log(`🛑 Closing voice service for call: ${this.callId}`);

    // Close Gemini session
    if (this.geminiSession) {
      this.geminiSession.close();
    }

    await this._handleSessionEnd();
  }

  /**
   * Get session statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      callId: this.callId,
      agentId: this.agentId,
      agentName: this.agent?.name,
      isReady: this.isReady,
      isClosed: this.isClosed,
      audioChunksSent: this.audioChunksSent,
      audioChunksReceived: this.audioChunksReceived,
      conversationTurns: this.conversationTurns.length,
      durationSeconds: this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0
    };
  }
}

export default VoiceService;
