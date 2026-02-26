/**
 * MediaStream Integration with State Machine
 *
 * Wires WebSocket audio events from Twilio/SansPBX to state machine.
 * This is the glue between mediastream.handler.js and the state machine.
 */

export class MediaStreamStateMachineIntegration {
  constructor(voiceService, adapter) {
    this.voiceService = voiceService;
    this.adapter = adapter;
    this._setupVoiceServiceListeners();
  }

  /**
   * Setup listeners on VoiceService for state machine events
   * @private
   */
  _setupVoiceServiceListeners() {
    // When voice service receives audio chunk
    this.voiceService.on('audioChunk', (audioChunk) => {
      if (this.adapter) {
        this.adapter.onAudioChunk(audioChunk);
      }
    });

    // When Gemini sends response audio
    this.voiceService.on('geminiAudioReceived', (audioBuffer) => {
      if (this.adapter) {
        this.adapter.onGeminiAudioReceived(audioBuffer);
      }
    });

    // When Gemini finishes speaking
    this.voiceService.on('geminiFinished', () => {
      if (this.adapter) {
        this.adapter.onGeminiFinished();
      }
    });

    // When Gemini errors
    this.voiceService.on('geminiError', (error) => {
      if (this.adapter) {
        this.adapter.onGeminiError(error);
      }
    });

    // When call times out
    this.voiceService.on('callTimeout', () => {
      if (this.adapter) {
        this.adapter.onCallTimeout();
      }
    });

    // When manual hangup requested
    this.voiceService.on('manualHangup', () => {
      if (this.adapter) {
        this.adapter.onManualHangup();
      }
    });

    console.log(`✅ [INTEGRATION] State machine listeners setup on VoiceService`);
  }

  /**
   * Setup listeners for state machine actions
   */
  setupStateActionListeners() {
    // Filler playback
    this.voiceService.on('adapterStartFiller', () => {
      console.log(`🔊 [INTEGRATION] Start filler requested by state machine`);
      this.voiceService.emit('playFiller');
    });

    this.voiceService.on('adapterStopFiller', () => {
      console.log(`⏹️ [INTEGRATION] Stop filler requested by state machine`);
      this.voiceService.emit('stopFiller');
    });

    // Gemini control
    this.voiceService.on('adapterStopGemini', () => {
      console.log(`🛑 [INTEGRATION] Stop Gemini requested by state machine`);
      if (this.voiceService.geminiSession) {
        this.voiceService.geminiSession.stop();
      }
    });

    this.voiceService.on('adapterStopAllAudio', () => {
      console.log(`🛑 [INTEGRATION] Stop all audio requested by state machine`);
      this.voiceService.emit('stopAllAudio');
    });

    // Principle injection
    this.voiceService.on('adapterInjectPrinciples', (principles) => {
      console.log(`💉 [INTEGRATION] Inject principles requested: ${principles.join(', ')}`);
      this.voiceService.emit('applyPrinciples', principles);
    });

    // Close session
    this.voiceService.on('adapterCloseGemini', () => {
      console.log(`🔌 [INTEGRATION] Close Gemini requested by state machine`);
      if (this.voiceService.geminiSession) {
        this.voiceService.geminiSession.close();
      }
    });

    // Save call record
    this.voiceService.on('adapterSaveCallRecord', (record) => {
      console.log(`💾 [INTEGRATION] Save call record requested by state machine`);
      this.voiceService.emit('saveCallRecord', record);
    });

    console.log(`✅ [INTEGRATION] State machine action listeners setup`);
  }

  /**
   * Convert Twilio message to state machine event
   * Called from mediastream.handler.js
   */
  static handleTwilioMediaMessage(message, adapter) {
    if (typeof message === 'string') {
      const parsed = JSON.parse(message);

      // Twilio 'start' event
      if (parsed.event === 'start') {
        console.log(`📞 [INTEGRATION] Twilio media stream started: ${parsed.streamSid}`);
      }

      // Twilio media audio event
      if (parsed.event === 'media') {
        const audioBuffer = Buffer.from(parsed.media.payload, 'base64');
        adapter.onAudioChunk(audioBuffer);
      }

      // Twilio stop event
      if (parsed.event === 'stop') {
        console.log(`📞 [INTEGRATION] Twilio media stream stopped`);
        adapter.onManualHangup();
      }
    }
  }

  /**
   * Convert SansPBX AudioSocket message to state machine event
   * Called from mediastream.handler.js
   */
  static handleSansPBXMediaMessage(buffer, adapter) {
    // SansPBX sends raw PCM audio (no JSON wrapper)
    if (Buffer.isBuffer(buffer)) {
      adapter.onAudioChunk(buffer);
    }
  }

  /**
   * Handle Gemini response in mediastream
   */
  static handleGeminiResponse(audioBuffer, adapter) {
    adapter.onGeminiAudioReceived(audioBuffer);
  }

  /**
   * Handle interruption detection
   */
  static handleInterruptionDetected(audioChunk, adapter) {
    const state = adapter.getCurrentState();
    if (state && state.value === 'RESPONDING') {
      adapter.onInterruptionDetected(audioChunk);
    }
  }
}

export default MediaStreamStateMachineIntegration;
