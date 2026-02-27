/**
 * Interrupt Handler Service
 * Gap 21: Detect user interruption and stop agent audio playback
 *
 * Monitors incoming audio for voice activity while agent is speaking
 * Sends interrupt signal to stop agent response
 */

export class InterruptHandler {
  constructor(interruptionSensitivity = 0.5, silenceThreshold = 0.003) {
    this.interruptionSensitivity = interruptionSensitivity; // 0-1, higher = more sensitive
    this.silenceThreshold = silenceThreshold;
    this.isAgentSpeaking = false;
    this.agentAudioBuffer = Buffer.alloc(0);
    this.lastUserSpeechTime = Date.now();
    this.consecutiveVoiceFrames = 0;
    this.voiceFrameThreshold = 3; // Need 3+ voice frames to trigger interrupt
    this.interruptCallbacks = [];
  }

  /**
   * Mark that agent is speaking
   * @param {Buffer} audioBuffer - Audio being sent to caller
   */
  agentStartsSpeaking(audioBuffer) {
    this.isAgentSpeaking = true;
    this.agentAudioBuffer = Buffer.concat([this.agentAudioBuffer, audioBuffer]);
    this.consecutiveVoiceFrames = 0;

    // Limit buffer size
    if (this.agentAudioBuffer.length > 131072) { // 128KB max
      const excess = this.agentAudioBuffer.length - 131072;
      this.agentAudioBuffer = this.agentAudioBuffer.slice(excess);
    }
  }

  /**
   * Mark that agent stopped speaking
   */
  agentStopsSpeaking() {
    this.isAgentSpeaking = false;
    this.agentAudioBuffer = Buffer.alloc(0);
    this.consecutiveVoiceFrames = 0;
  }

  /**
   * Check if user is interrupting (speaking while agent speaks)
   * @param {Buffer} audioBuffer - Audio from user
   * @returns {object} - { interrupted: boolean, voiceEnergy: number, confidence: 0-1 }
   */
  detectInterruption(audioBuffer) {
    if (!this.isAgentSpeaking) {
      return { interrupted: false, voiceEnergy: 0, confidence: 0 };
    }

    // Calculate voice energy (RMS)
    const voiceEnergy = this.calculateVoiceEnergy(audioBuffer);

    // Adjust threshold based on sensitivity (0-1 scale)
    // Higher sensitivity = lower threshold = easier to trigger
    const adjustedThreshold = this.silenceThreshold * (2 - this.interruptionSensitivity);

    const hasVoice = voiceEnergy > adjustedThreshold;

    if (hasVoice) {
      this.consecutiveVoiceFrames++;
      this.lastUserSpeechTime = Date.now();
    } else {
      this.consecutiveVoiceFrames = Math.max(0, this.consecutiveVoiceFrames - 1);
    }

    // Interrupt if user has been speaking consistently
    const interrupted = this.consecutiveVoiceFrames >= this.voiceFrameThreshold;

    if (interrupted) {
      console.log(`🛑 INTERRUPT DETECTED: User speaking while agent playing (${this.consecutiveVoiceFrames} frames, energy: ${voiceEnergy.toFixed(4)})`);
      this.triggerInterrupt();
    }

    return {
      interrupted,
      voiceEnergy: voiceEnergy,
      confidence: Math.min(this.consecutiveVoiceFrames / this.voiceFrameThreshold, 1),
      threshold: adjustedThreshold,
      sensitivity: this.interruptionSensitivity
    };
  }

  /**
   * Calculate voice energy (RMS) of audio buffer
   * @param {Buffer} audioBuffer - Audio frame
   * @returns {number} - Normalized energy 0-1
   */
  calculateVoiceEnergy(audioBuffer) {
    let sumSquares = 0;
    const samples = audioBuffer.length / 2;

    for (let i = 0; i < samples; i++) {
      const sample = audioBuffer.readInt16LE(i * 2) / 32768.0;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples);
    return Math.min(rms, 1.0); // Clamp to [0, 1]
  }

  /**
   * Register callback for interrupt events
   * @param {function} callback - Called when interrupt detected
   */
  onInterrupt(callback) {
    this.interruptCallbacks.push(callback);
  }

  /**
   * Trigger interrupt event
   */
  triggerInterrupt() {
    this.interruptCallbacks.forEach(cb => {
      try {
        cb({
          timestamp: Date.now(),
          voiceFrames: this.consecutiveVoiceFrames,
          sensitivity: this.interruptionSensitivity
        });
      } catch (err) {
        console.error(`❌ Error in interrupt callback: ${err.message}`);
      }
    });
  }

  /**
   * Update interruption sensitivity
   * @param {number} newSensitivity - 0-1 (0=no interrupt, 1=very sensitive)
   */
  setSensitivity(newSensitivity) {
    this.interruptionSensitivity = Math.max(0, Math.min(1, newSensitivity));
    console.log(`🎚️ Interruption sensitivity updated to ${this.interruptionSensitivity.toFixed(2)}`);
  }

  /**
   * Get interrupt handler status
   * @returns {object} - Status info
   */
  getStatus() {
    return {
      agentSpeaking: this.isAgentSpeaking,
      interruptionSensitivity: this.interruptionSensitivity,
      voiceFramesDetected: this.consecutiveVoiceFrames,
      voiceFrameThreshold: this.voiceFrameThreshold,
      interruptReady: this.consecutiveVoiceFrames >= this.voiceFrameThreshold,
      timeSinceLastSpeech: Date.now() - this.lastUserSpeechTime + 'ms',
      agentBufferSize: this.agentAudioBuffer.length
    };
  }

  /**
   * Reset interrupt handler
   */
  reset() {
    this.isAgentSpeaking = false;
    this.agentAudioBuffer = Buffer.alloc(0);
    this.consecutiveVoiceFrames = 0;
    this.lastUserSpeechTime = Date.now();
  }
}

export default InterruptHandler;
