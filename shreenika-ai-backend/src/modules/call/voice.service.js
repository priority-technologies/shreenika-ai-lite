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
import { sharedCachingService } from '../voice/context-caching.service.js';
import LatencyTracker from '../voice/latency-tracker.service.js';
import { enhanceResponseForLatency } from '../voice/response-enhancer.service.js';
import HedgeEngine from '../voice/hedge-engine.service.js';
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
    this.latencyTracker = new LatencyTracker(callId, agentId); // Track latency
    this.hedgeEngine = new HedgeEngine(callId, agentId); // Latency masking (Hedge Engine)

    this.conversationTurns = [];
    this.currentTurnText = '';
    this.isReady = false;
    this.isClosed = false;

    // Statistics
    this.audioChunksSent = 0;
    this.audioChunksReceived = 0;
    this.startTime = null;
    this.userSpeechStart = null; // Track when user starts speaking
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

      // Initialize Hedge Engine with filler audio
      try {
        this.hedgeEngine.fillerBuffers = await HedgeEngine.initializeFillers();
        this.hedgeEngine.on('playFiller', (fillerBuffer) => {
          // Emit filler audio to be played
          if (fillerBuffer) {
            console.log(`🎙️ Playing filler audio (${fillerBuffer.length} bytes)`);
            this.emit('audio', fillerBuffer);
          }
        });
        console.log(`🎯 Hedge Engine initialized (400ms latency masking)`);
      } catch (err) {
        console.warn('⚠️ Hedge Engine setup failed:', err.message);
      }

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

      // Create Gemini Live session with voice customization and Context Caching
      try {
        this.geminiSession = await createGeminiLiveSession(this.agent, knowledgeDocs, this.voiceConfig);
      } catch (err) {
        console.error(`❌ Failed to create Gemini session:`, err.message);
        throw new Error(`Gemini session creation failed: ${err.message}`);
      }

      // Set up Gemini event handlers
      this._setupGeminiHandlers();

      // Connect to Gemini Live API with retry logic (3 attempts with exponential backoff)
      // This fixes the issue where concurrent campaigns fail due to Gemini API timeouts
      const connectStartTime = Date.now();
      try {
        await this._connectToGeminiWithRetry(3, 10000); // 3 retries, 10 second timeout per attempt
        const connectDuration = Date.now() - connectStartTime;
        console.log(`✅ Gemini Live connection established in ${connectDuration}ms`);
      } catch (err) {
        const connectDuration = Date.now() - connectStartTime;
        console.error(`❌ Gemini Live connection failed after ${connectDuration}ms (3 retries exhausted):`, err.message);
        throw new Error(`Gemini Live connection failed after 3 retries: ${err.message}`);
      }

      this.startTime = Date.now();
      console.log(`✅ Voice service ready for call: ${this.callId}`);

    } catch (error) {
      console.error(`❌ Voice service initialization failed:`, error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Connect to Gemini Live with retry logic (3 attempts)
   * Fixes: Gemini API timeouts during high concurrency campaigns
   * @param {number} maxRetries - Maximum retry attempts (default 3)
   * @param {number} timeoutMs - Timeout per attempt in milliseconds (default 10000)
   * @private
   */
  async _connectToGeminiWithRetry(maxRetries = 3, timeoutMs = 10000) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔌 Gemini connection attempt ${attempt}/${maxRetries} (timeout: ${timeoutMs}ms)...`);

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Connection timeout after ${timeoutMs}ms`)), timeoutMs)
        );

        // Race against timeout
        await Promise.race([
          this.geminiSession.connect(),
          timeoutPromise
        ]);

        console.log(`✅ Gemini connection successful on attempt ${attempt}`);
        return; // Success
      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 3s
          const waitTime = attempt * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries exhausted
    throw lastError || new Error('Failed to connect to Gemini after all retries');
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
      // Mark Gemini audio received for Hedge Engine
      if (this.audioChunksReceived === 1) {
        this.hedgeEngine.markGeminiAudioReceived();
      }
      this.emit('audio', audioBuffer);
    });

    // Text response from Gemini (for transcript)
    this.geminiSession.on('text', (text) => {
      // Mark first response chunk for latency tracking
      if (!this.userSpeechStart && this.currentTurnText.length === 0) {
        this.latencyTracker.markFirstResponseAudioChunk();
      }

      this.currentTurnText += text;
    });

    // Turn complete (agent finished speaking)
    this.geminiSession.on('turnComplete', () => {
      if (this.currentTurnText) {
        // Enhance response with latency optimization
        const shouldEnhance = this.userSpeechStart !== null;
        this._addConversationTurn('agent', this.currentTurnText, shouldEnhance);
        this.currentTurnText = '';

        // Reset for next turn
        this.userSpeechStart = null;
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
   * @param {number} energyLevel - Audio energy level (0-100) for speech detection
   */
  sendAudio(pcmBuffer, energyLevel = 0) {
    if (!this.isReady || this.isClosed) {
      if (this._audioDropCount === undefined) this._audioDropCount = 0;
      this._audioDropCount++;
      if (this._audioDropCount <= 3 || this._audioDropCount % 50 === 0) {
        console.warn(`⚠️ VoiceService: Audio dropped - isReady=${this.isReady}, isClosed=${this.isClosed} (dropped ${this._audioDropCount} chunks)`);
      }
      return;
    }

    // Detect user speech (energy level indicates speaking)
    const speechThreshold = 20; // RMS threshold for speech

    // User starts speaking
    if (energyLevel > speechThreshold && !this.userSpeechStart) {
      this.userSpeechStart = Date.now();
      this.latencyTracker.markUserSpeechDetected();
      console.log(`🎤 User speech detected, starting latency measurement`);
    }

    // User stops speaking (energy drops below threshold)
    if (energyLevel <= speechThreshold && this.userSpeechStart && !this._userSpeechEnded) {
      this._userSpeechEnded = true;
      this.hedgeEngine.markUserSpeechEnded();
      console.log(`🤐 User speech ended, Hedge Engine activated`);
    }

    // Reset speech-ended flag when speaking resumes
    if (energyLevel > speechThreshold && this._userSpeechEnded) {
      this._userSpeechEnded = false;
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
   * Add a conversation turn with optional latency enhancement
   * @private
   * @param {string} role - 'agent' or 'user'
   * @param {string} content - Text content
   * @param {boolean} enhanceForLatency - Apply latency optimization
   */
  _addConversationTurn(role, content, enhanceForLatency = false) {
    let enhancedContent = content;

    // Enhance agent responses for latency if needed
    if (role === 'agent' && enhanceForLatency && this.userSpeechStart) {
      const responseLatency = Date.now() - this.userSpeechStart;
      enhancedContent = enhanceResponseForLatency(
        content,
        responseLatency,
        this.agent,
        this.voiceConfig
      );

      console.log(`✨ Response enhanced (latency: ${responseLatency}ms): Added fillers/pauses`);
    }

    const turn = {
      role,
      content: enhancedContent,
      timestamp: new Date(),
      originalContent: enhancedContent !== content ? content : null, // Store original if enhanced
      latency: role === 'agent' && this.userSpeechStart ? Date.now() - this.userSpeechStart : null
    };

    this.conversationTurns.push(turn);

    // Emit for real-time transcript
    this.emit('text', enhancedContent, role);

    // Emit via Socket.IO for frontend updates
    if (this.call && this.call.userId) {
      io.emit('call:transcript', {
        userId: this.call.userId.toString(),
        callId: this.callId.toString(),
        turn
      });
    }

    // Log
    console.log(`💬 [${role.toUpperCase()}]: ${enhancedContent.substring(0, 100)}${enhancedContent.length > 100 ? '...' : ''}`);
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

    // Log latency diagnostics
    this.latencyTracker.logDiagnostics();

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

    // ✅ CRITICAL: Refresh cache TTL to keep it warm 24/7
    // Without this, cache expires after 60 min → full cost on next call
    if (this.geminiSession?.cacheId) {
      sharedCachingService.refreshTTL(this.geminiSession.cacheId)
        .catch(err => console.warn('⚠️  Cache TTL refresh skipped (non-critical):', err.message));
    }

    // Close Hedge Engine
    if (this.hedgeEngine) {
      this.hedgeEngine.close();
    }

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
