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
import VoiceServiceAdapter from './state-machine/voice-service-adapter.js';
import MediaStreamStateMachineIntegration from './state-machine/mediastream-integration.js';
// 🔴 PHASE 2 INTEGRATION: Import all audio quality services
import CodecNegotiator from './codec-negotiation.service.js';
import EchoCanceller from './echo-cancellation.service.js';
import NoiseSuppressor from './noise-suppression.service.js';
import { JitterBuffer } from './jitter-buffer.service.js';
import { InterruptHandler } from './interrupt-handler.service.js';
import { CallTimeout } from './call-timeout.service.js';
import { WebhookEmitter } from './webhook-emitter.service.js';
import { AudioQualityMonitor } from './audio-quality-monitor.service.js';

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

    // State machine integration
    this.stateMachineAdapter = null;
    this.smIntegration = null;

    // 🔴 PHASE 2 SERVICES - Audio Quality & Stability
    this.codecNegotiator = null; // Gap 11: Codec negotiation
    this.echoCanceller = null; // Gap 8: Echo cancellation
    this.noiseSuppressor = null; // Gap 9: Noise suppression
    this.jitterBuffer = null; // Gap 10: Jitter buffer
    this.interruptHandler = null; // Gap 21: Interrupt detection
    this.callTimeout = null; // Gap 22: Call timeout enforcement
    this.webhookEmitter = null; // Gap 24: Webhook notifications
    this.qualityMonitor = null; // Gap 26: Audio quality monitoring

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
      // Pass lead name for personalized welcome message (Bug 2.2)
      const leadName = !this.isTestMode && this.call?.leadName ? this.call.leadName : null;
      try {
        this.geminiSession = await createGeminiLiveSession(this.agent, knowledgeDocs, this.voiceConfig, leadName);
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

      // 🔴 PHASE 2 INTEGRATION: Initialize audio quality services
      try {
        // Gap 11: Codec negotiation
        this.codecNegotiator = new CodecNegotiator();
        this.codecNegotiator.logNegotiationStatus('SansPBX');

        // Gap 8: Echo cancellation
        this.echoCanceller = new EchoCanceller(4096, 0.01);
        console.log(`✅ Echo canceller initialized (adaptive LMS filter)`);

        // Gap 9: Noise suppression
        this.noiseSuppressor = new NoiseSuppressor(512, 0.98);
        console.log(`✅ Noise suppressor initialized (spectral subtraction)`);

        // Gap 10: Jitter buffer
        this.jitterBuffer = new JitterBuffer(20, 50);
        console.log(`✅ Jitter buffer initialized (max 20 frames, target 50ms latency)`);

        // Gap 21: Interrupt handler
        this.interruptHandler = new InterruptHandler(
          this.agent.speechSettings?.interruptionSensitivity || 0.5,
          0.003 // silence threshold
        );
        this.interruptHandler.onInterrupt((event) => {
          console.log(`🛑 INTERRUPT: User interrupted at ${event.timestamp}`);
          // Notify state machine of interruption
          if (this.stateMachineAdapter) {
            this.stateMachineAdapter.onInterrupt(event);
          }
        });
        console.log(`✅ Interrupt handler initialized`);

        // Gap 22: Call timeout
        this.callTimeout = new CallTimeout(
          (this.agent.maxCallDuration || 600) * 1000, // Max duration
          30000, // Silence timeout
          30000  // Response timeout
        );
        this.callTimeout.onTimeout((event) => {
          console.warn(`⏱️  CALL TIMEOUT [${event.type}]: ${event.reason}`);
          this.emit('timeout', event);
        });
        this.callTimeout.start();
        console.log(`✅ Call timeout initialized`);

        // Gap 24: Webhook emitter
        this.webhookEmitter = new WebhookEmitter(process.env.WEBHOOK_URL || null);
        console.log(`✅ Webhook emitter initialized`);

        // Gap 26: Audio quality monitor
        this.qualityMonitor = new AudioQualityMonitor(this.callId);
        this.qualityMonitor.onAlert((alert) => {
          console.warn(`⚠️  QUALITY ALERT [${alert.severity}]: ${alert.message}`);
          if (this.webhookEmitter) {
            this.webhookEmitter.emitQualityAlert({
              callId: this.callId,
              severity: alert.severity,
              type: alert.type,
              value: alert.value,
              threshold: process.env.QUALITY_THRESHOLD || 50
            });
          }
        });
        console.log(`✅ Audio quality monitor initialized`);

        console.log(`✅ PHASE 2: All audio quality services initialized`);
      } catch (err) {
        console.warn(`⚠️  Phase 2 initialization failed: ${err.message}. Continuing without quality features.`);
      }

      // Initialize state machine adapter
      try {
        this.stateMachineAdapter = new VoiceServiceAdapter(this, {
          interruptionSensitivity: this.agent.speechSettings?.interruptionSensitivity || 0.5,
          maxCallDuration: this.agent.maxCallDuration || 600,
          voiceConfig: this.voiceConfig
        });

        this.stateMachineAdapter.initializeStateMachine(this.callId, this.agentId);

        this.smIntegration = new MediaStreamStateMachineIntegration(
          this,
          this.stateMachineAdapter
        );
        this.smIntegration.setupStateActionListeners();

        console.log(`✅ State machine initialized for call: ${this.callId}`);
        console.log(`📊 State Machine Config:`);
        console.log(`   ├─ Interruption Sensitivity: ${this.stateMachineAdapter.voiceService.stateMachineAdapter?.getCurrentState()?.context.interruptionSensitivity || 'N/A'}`);
        console.log(`   └─ Max Duration: ${this.agent.maxCallDuration || 600}s`);
      } catch (error) {
        console.warn(`⚠️ State machine initialization failed (non-critical):`, error.message);
      }

      // Wire state machine filler actions to HedgeEngine
      if (this.smIntegration && this.hedgeEngine) {
        this.on('adapterStartFiller', () => {
          console.log(`🔊 Voice Service: Starting filler playback`);
          this.hedgeEngine.startFillerPlayback();
        });

        this.on('adapterStopFiller', () => {
          console.log(`⏹️ Voice Service: Stopping filler playback`);
          this.hedgeEngine.stopFillerPlayback();
        });

        // Forward HedgeEngine filler audio to browser/caller
        this.hedgeEngine.on('playFiller', (fillerBuffer) => {
          if (fillerBuffer) {
            console.log(`🎙️ Filler audio: ${fillerBuffer.length} bytes`);
            this.emit('audio', fillerBuffer);
          }
        });
      }

      // Initialization complete - log full diagnostic
      const initDurationMs = Date.now() - this.startTime;
      console.log(`✅ VOICE SERVICE INITIALIZATION COMPLETE`);
      console.log(`   ├─ Call ID: ${this.callId}`);
      console.log(`   ├─ Agent: ${this.agent.name}`);
      console.log(`   ├─ Gemini Ready: ${this.isReady}`);
      console.log(`   ├─ Duration: ${initDurationMs}ms`);
      console.log(`   ├─ Services Initialized:`);
      console.log(`   │  ├─ Echo Canceller: ${this.echoCanceller ? '✅' : '❌'}`);
      console.log(`   │  ├─ Noise Suppressor: ${this.noiseSuppressor ? '✅' : '❌'}`);
      console.log(`   │  ├─ Jitter Buffer: ${this.jitterBuffer ? '✅' : '❌'}`);
      console.log(`   │  ├─ Interrupt Handler: ${this.interruptHandler ? '✅' : '❌'}`);
      console.log(`   │  ├─ Call Timeout: ${this.callTimeout ? '✅' : '❌'}`);
      console.log(`   │  ├─ Webhook Emitter: ${this.webhookEmitter ? '✅' : '❌'}`);
      console.log(`   │  └─ Quality Monitor: ${this.qualityMonitor ? '✅' : '❌'}`);
      console.log(`   └─ Status: READY TO RECEIVE AUDIO`);

    } catch (error) {
      console.error(`❌ VOICE SERVICE INITIALIZATION FAILED`);
      console.error(`   ├─ Call ID: ${this.callId}`);
      console.error(`   ├─ Error: ${error.message}`);
      console.error(`   ├─ This is a CRITICAL error - call cannot proceed`);
      console.error(`   └─ Check: GOOGLE_API_KEY, model availability, network connectivity`);
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

      // DISABLED: Welcome message causes 2-3 second latency
      // Agent now responds naturally to first user input without explicit greeting
      // This reduces initial latency from 6s to <2s
      // if (this.agent.welcomeMessage) {
      //   console.log(`👋 Sending welcome message`);
      //   this.geminiSession.sendText(this.agent.welcomeMessage);
      // }
    });

    // Audio response from Gemini
    this.geminiSession.on('audio', (audioBuffer) => {
      this.audioChunksReceived++;
      // 🔴 DIAGNOSTIC: Log every audio chunk received from Gemini
      const KB = (audioBuffer.length / 1024).toFixed(2);
      console.log(`📥 ✅ Audio chunk #${this.audioChunksReceived} received from Gemini: ${audioBuffer.length} bytes (${KB} KB)`);

      // Mark Gemini audio received for Hedge Engine
      if (this.audioChunksReceived === 1) {
        console.log(`🎯 First audio chunk from Gemini - marking audio received time for latency`);
        this.hedgeEngine.markGeminiAudioReceived();
      }

      // 🔴 PHASE 2: Update audio quality services with outgoing audio
      try {
        // Gap 8: Store outgoing audio in echo canceller for echo detection
        if (this.echoCanceller) {
          this.echoCanceller.storeOutgoingAudio(audioBuffer);
        }

        // Gap 21: Mark that agent is speaking (for interrupt detection)
        if (this.interruptHandler) {
          this.interruptHandler.agentStartsSpeaking(audioBuffer);
        }

        // Gap 22: Record response from agent for timeout reset
        if (this.callTimeout) {
          this.callTimeout.recordResponse();
        }

        // Gap 26: Monitor quality of outgoing audio
        if (this.qualityMonitor) {
          // Gemini audio is typically clean, but track it
          this.qualityMonitor.recordAudioLevel(0.5); // Assume good level
        }
      } catch (err) {
        console.warn(`⚠️ Error updating Phase 2 services: ${err.message}`);
      }

      // Forward to mediastream handler
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

        // 🔗 Notify state machine that Gemini finished
        this._notifyStateMachineGeminiFinished();

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

      // 🔗 Notify state machine
      if (this.stateMachineAdapter) {
        this.stateMachineAdapter.onGeminiError(error);
      }

      this.emit('error', error);
    });

    // Close
    this.geminiSession.on('close', ({ code, reason }) => {
      console.log(`🔌 Gemini session closed: ${code} ${reason}`);
      if (!this.isClosed) {
        this._handleSessionEnd().catch(err => {
          console.error(`❌ Error in session end handler:`, err.message);
        });
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

      // CRITICAL: Log first failure with detailed diagnostics
      if (this._audioDropCount === 1) {
        console.error(`❌ CRITICAL: VoiceService not ready for audio - isReady=${this.isReady}, isClosed=${this.isClosed}`);
        console.error(`   This means Gemini Live setupComplete event was not received`);
        console.error(`   Possible causes:`);
        console.error(`   1. Gemini Live API connection failed (check GOOGLE_API_KEY)`);
        console.error(`   2. Network connectivity issue between backend and Google API`);
        console.error(`   3. API quota exceeded or model unavailable`);
        console.error(`   4. WebSocket connection closed before setupComplete`);
        console.error(`   Audio will be silently dropped for this call`);
      }

      if (this._audioDropCount <= 10 || this._audioDropCount % 100 === 0) {
        console.warn(`⚠️ Audio dropped #${this._audioDropCount} (isReady=${this.isReady}, isClosed=${this.isClosed})`);
      }
      return;
    }

    // 🔴 PHASE 2: Apply audio quality processing to INCOMING caller audio
    let processedBuffer = pcmBuffer;

    try {
      // Gap 8: Echo cancellation - remove caller's own voice
      if (this.echoCanceller && this.audioChunksReceived > 0) {
        const echoStatus = this.echoCanceller.detectEcho(processedBuffer);
        if (echoStatus.echoDetected && this.audioChunksSent % 20 === 0) {
          console.log(`🔊 Echo detected: ${echoStatus.echoAmount.toFixed(3)} correlation, ${echoStatus.delay}ms delay`);
        }
        processedBuffer = this.echoCanceller.cancelEcho(processedBuffer);
      }

      // Gap 9: Noise suppression - remove background noise
      if (this.noiseSuppressor) {
        processedBuffer = this.noiseSuppressor.suppressNoise(processedBuffer);
      }

      // Gap 10: Jitter buffer - smooth network delays
      if (this.jitterBuffer) {
        const readyAudio = this.jitterBuffer.addPacket({
          sequence: this.audioChunksSent,
          data: processedBuffer,
          timestamp: Date.now()
        });
        if (readyAudio) {
          processedBuffer = readyAudio;
        }
      }

      // Gap 21: Interrupt detection - detect user speaking while agent speaks
      if (this.interruptHandler && this.audioChunksSent > 0) {
        const interruptStatus = this.interruptHandler.detectInterruption(processedBuffer);
        if (interruptStatus.interrupted) {
          console.log(`🛑 User interrupt detected (confidence: ${(interruptStatus.confidence * 100).toFixed(0)}%)`);
        }
      }

      // Gap 22: Record audio activity for timeout reset
      if (this.callTimeout) {
        this.callTimeout.recordAudioActivity();
      }

      // Gap 26: Monitor audio quality
      if (this.qualityMonitor) {
        this.qualityMonitor.recordAudioLevel(energyLevel / 100);
        this.qualityMonitor.recordPacketStats({ totalPackets: 1, lostPackets: 0 });
      }
    } catch (processingError) {
      console.warn(`⚠️ Audio processing error: ${processingError.message}. Using original audio.`);
      processedBuffer = pcmBuffer;
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
    // 🔴 DIAGNOSTIC: Log audio chunks being sent to Gemini
    const KB = (processedBuffer.length / 1024).toFixed(2);
    if (this.audioChunksSent <= 3 || this.audioChunksSent % 10 === 0) {
      console.log(`🎤 Audio chunk #${this.audioChunksSent} sent to Gemini: ${processedBuffer.length} bytes (${KB} KB), energy=${energyLevel.toFixed(0)}`);
    }

    // 🔗 Emit to state machine
    this._emitAudioChunkToStateMachine(processedBuffer);

    this.geminiSession.sendAudio(processedBuffer);
  }

  /**
   * Emit audio chunk to state machine for processing
   * @private
   */
  _emitAudioChunkToStateMachine(audioChunk) {
    if (this.stateMachineAdapter) {
      this.stateMachineAdapter.onAudioChunk(audioChunk);
    }
  }

  /**
   * Notify state machine that Gemini finished speaking
   * @private
   */
  _notifyStateMachineGeminiFinished() {
    if (this.stateMachineAdapter) {
      // CRITICAL FIX: Don't close Gemini session in test mode
      // Test mode allows multiple turns without state machine lifecycle
      if (this.isTestMode) {
        console.log(`ℹ️ Test mode: Skipping state machine notification on Gemini finished`);
        return;
      }
      this.stateMachineAdapter.onGeminiFinished();
    }
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

    // ✅ PHASE 2: Close all audio quality services
    try {
      // Stop call timeout monitoring
      if (this.callTimeout) {
        const timeoutStatus = this.callTimeout.getStatus();
        console.log(`⏱️  Call timeout status: ${JSON.stringify(timeoutStatus)}`);
      }

      // Get and log quality report
      if (this.qualityMonitor) {
        const qualityReport = this.qualityMonitor.getReport();
        console.log(`📊 QUALITY REPORT:`, JSON.stringify(qualityReport, null, 2));

        // Emit quality alert for any SLA violations
        if (this.webhookEmitter && qualityReport.activeAlerts > 0) {
          for (const alert of qualityReport.alerts) {
            await this.webhookEmitter.emitQualityAlert({
              callId: this.callId,
              severity: alert.severity,
              type: alert.type,
              value: alert.value,
              threshold: this.qualityMonitor.thresholds[
                ['maxPacketLoss', 'maxJitter', 'maxLatency', 'maxNoise', 'minAudioLevel'][
                  ['PACKET_LOSS', 'HIGH_JITTER', 'HIGH_LATENCY', 'HIGH_NOISE', 'LOW_AUDIO'].indexOf(alert.type)
                ]
              ]
            });
          }
        }
      }

      // Close webhook emitter with call ended event
      if (this.webhookEmitter) {
        const callDuration = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        await this.webhookEmitter.emitCallEnded({
          callId: this.callId,
          duration: callDuration,
          endReason: 'call_completed',
          status: 'ENDED',
          metrics: {
            audioChunksSent: this.audioChunksSent,
            audioChunksReceived: this.audioChunksReceived,
            conversationTurns: this.conversationTurns.length
          }
        });
      }

      // Flush remaining audio from jitter buffer
      if (this.jitterBuffer) {
        const remaining = this.jitterBuffer.flush();
        if (remaining && remaining.length > 0) {
          console.log(`🔊 Flushed ${remaining.length} frames from jitter buffer`);
        }
      }

      // Log service statuses
      console.log(`✅ Echo Canceller: ${this.echoCanceller ? 'Active' : 'Disabled'}`);
      console.log(`✅ Noise Suppressor: ${this.noiseSuppressor ? 'Active' : 'Disabled'}`);
      console.log(`✅ Jitter Buffer: ${this.jitterBuffer ? 'Active' : 'Disabled'}`);
      console.log(`✅ Interrupt Handler: ${this.interruptHandler ? 'Active' : 'Disabled'}`);
      console.log(`✅ Codec Negotiator: ${this.codecNegotiator ? 'Active' : 'Disabled'}`);

    } catch (cleanupError) {
      console.error(`⚠️  Error during Phase 2 cleanup: ${cleanupError.message}`);
    }

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
