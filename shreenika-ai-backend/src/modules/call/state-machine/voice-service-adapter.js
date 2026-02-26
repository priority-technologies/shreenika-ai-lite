/**
 * Voice Service Adapter
 *
 * Bridges VoiceService with StateMachineController.
 * Converts audio events into state machine events.
 * Converts state machine actions into VoiceService operations.
 */

import { EventEmitter } from 'events';
import StateMachineController from './state-machine.controller.js';

export class VoiceServiceAdapter extends EventEmitter {
  constructor(voiceService, config = {}) {
    super();

    this.voiceService = voiceService;
    this.config = config;
    this.stateMachine = null;
    this.silenceBuffer = [];
    this.SILENCE_THRESHOLD = 0.008;
    this.silenceDurationTarget = 800; // 800ms = speech finished

    this._setupStateTransitions();
  }

  /**
   * Initialize state machine
   */
  initializeStateMachine(callId, agentId) {
    console.log(`🔗 [ADAPTER] Initializing state machine for call: ${callId}`);

    this.stateMachine = new StateMachineController(
      callId,
      agentId,
      this.voiceService,
      this.config
    );

    // Listen to state changes
    this.stateMachine.on('stateChange', (event) => {
      this._handleStateChange(event);
    });

    this.stateMachine.on('error', (error) => {
      console.error(`🔗 [ADAPTER] State machine error:`, error);
      this.voiceService.emit('error', error);
    });

    // Start state machine
    this.stateMachine.start({
      callId,
      agentId,
      interruptionSensitivity: this.config.interruptionSensitivity || 0.5,
      maxCallDuration: this.config.maxCallDuration || 600,
      voiceConfig: this.config.voiceConfig || null
    });

    console.log(`✅ [ADAPTER] State machine initialized`);
  }

  /**
   * Setup state machine action handlers
   * @private
   */
  _setupStateTransitions() {
    // These handlers will be called by state machine actions
    this.handlers = {
      startFiller: () => this._startFillerHandler(),
      stopFiller: () => this._stopFillerHandler(),
      playGeminiAudio: () => this._playGeminiAudioHandler(),
      stopGemini: () => this._stopGeminiHandler(),
      stopAllAudio: () => this._stopAllAudioHandler(),
      injectPrinciples: (principles) => this._injectPrinciplesHandler(principles),
      closeGemini: () => this._closeGeminiHandler(),
      saveCallRecord: (record) => this._saveCallRecordHandler(record)
    };
  }

  /**
   * Handle state changes
   * @private
   */
  _handleStateChange(event) {
    const { state, context } = event;
    console.log(`🎯 [ADAPTER] State changed to: ${state}`);

    // Emit state change for external listeners
    this.voiceService.emit('stateMachineStateChange', { state, context });
  }

  /**
   * Send audio chunk to state machine
   */
  onAudioChunk(pcmBuffer) {
    if (!this.stateMachine) {
      console.warn(`⚠️ [ADAPTER] State machine not initialized, dropping audio chunk`);
      return;
    }

    const state = this.stateMachine.getState();

    // Only process audio in relevant states
    if (state.value === 'LISTENING') {
      this.stateMachine.onHumanAudioDetected(pcmBuffer);
    } else if (state.value === 'HUMAN_SPEAKING') {
      this.stateMachine.onAudioChunk(pcmBuffer);
      this._detectSilence(pcmBuffer);
    } else if (state.value === 'RESPONDING') {
      // Check for interruption
      this.stateMachine.onInterruptionDetected(pcmBuffer);
    }
  }

  /**
   * Detect silence from audio buffer
   * @private
   */
  _detectSilence(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) return;

    // Calculate RMS
    let sumSquares = 0;
    const samples = audioBuffer.length / 2;

    for (let i = 0; i < samples; i++) {
      const sample = audioBuffer.readInt16LE(i * 2) / 32768.0;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples);

    if (rms < this.SILENCE_THRESHOLD) {
      this.silenceBuffer.push(audioBuffer);
      const silenceDuration = this.silenceBuffer.length * 20; // 20ms per chunk

      if (silenceDuration > this.silenceDurationTarget) {
        console.log(`🤐 [ADAPTER] Silence detected: ${silenceDuration}ms`);
        this.stateMachine.onSilenceDetected(silenceDuration);
        this.silenceBuffer = []; // Reset
      }
    } else {
      this.silenceBuffer = []; // Reset on sound
    }
  }

  /**
   * Filler playback started
   * @private
   */
  _startFillerHandler() {
    console.log(`🔊 [ADAPTER] Starting filler from state machine action`);
    // Emit to voice service to actually play filler
    this.voiceService.emit('adapterStartFiller');
  }

  /**
   * Filler playback stopped
   * @private
   */
  _stopFillerHandler() {
    console.log(`⏹️ [ADAPTER] Stopping filler from state machine action`);
    this.voiceService.emit('adapterStopFiller');
  }

  /**
   * Gemini audio playback started
   * @private
   */
  _playGeminiAudioHandler() {
    console.log(`🎧 [ADAPTER] Playing Gemini audio from state machine action`);
    this.voiceService.emit('adapterPlayGeminiAudio');
  }

  /**
   * Gemini stopped speaking
   * @private
   */
  _stopGeminiHandler() {
    console.log(`🛑 [ADAPTER] Stopping Gemini from state machine action`);
    this.voiceService.emit('adapterStopGemini');
  }

  /**
   * All audio stopped
   * @private
   */
  _stopAllAudioHandler() {
    console.log(`🛑 [ADAPTER] Stopping all audio from state machine action`);
    this.voiceService.emit('adapterStopAllAudio');
  }

  /**
   * Inject principles to Gemini
   * @private
   */
  _injectPrinciplesHandler(principles) {
    console.log(`💉 [ADAPTER] Injecting principles: ${principles.join(', ')}`);
    this.voiceService.emit('adapterInjectPrinciples', principles);
  }

  /**
   * Close Gemini session
   * @private
   */
  _closeGeminiHandler() {
    console.log(`🔌 [ADAPTER] Closing Gemini session from state machine action`);
    this.voiceService.emit('adapterCloseGemini');
  }

  /**
   * Save call record
   * @private
   */
  _saveCallRecordHandler(record) {
    console.log(`💾 [ADAPTER] Saving call record from state machine action`);
    this.voiceService.emit('adapterSaveCallRecord', record);
  }

  /**
   * Gemini response received
   */
  onGeminiAudioReceived(audioBuffer) {
    if (!this.stateMachine) return;
    this.stateMachine.onGeminiResponseReceived(audioBuffer);
  }

  /**
   * Gemini finished speaking
   */
  onGeminiFinished() {
    if (!this.stateMachine) return;
    this.stateMachine.onGeminiFinished();
  }

  /**
   * Welcome message finished
   */
  onWelcomeFinished() {
    if (!this.stateMachine) return;
    this.stateMachine.onWelcomeFinished();
  }

  /**
   * Gemini error occurred
   */
  onGeminiError(error) {
    if (!this.stateMachine) return;
    this.stateMachine.onGeminiError(error);
  }

  /**
   * Manual hangup
   */
  onManualHangup() {
    if (!this.stateMachine) return;
    this.stateMachine.onManualHangup();
  }

  /**
   * Call timeout
   */
  onCallTimeout() {
    if (!this.stateMachine) return;
    this.stateMachine.onCallTimeout();
  }

  /**
   * Get current state
   */
  getCurrentState() {
    if (!this.stateMachine) return null;
    return this.stateMachine.getState();
  }

  /**
   * Get metrics
   */
  getMetrics() {
    if (!this.stateMachine) return null;
    return this.stateMachine.getMetrics();
  }

  /**
   * Check if in specific state
   */
  isInState(stateName) {
    if (!this.stateMachine) return false;
    return this.stateMachine.isInState(stateName);
  }

  /**
   * Stop state machine
   */
  stop() {
    if (this.stateMachine) {
      this.stateMachine.stop();
    }
  }

  /**
   * Log current state
   */
  logState() {
    if (this.stateMachine) {
      this.stateMachine.logState();
    }
  }
}

export default VoiceServiceAdapter;
