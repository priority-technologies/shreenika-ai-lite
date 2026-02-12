/**
 * Barge-In Handler
 * Handles user interruptions during AI speech
 * Stops TTS playback when user starts speaking
 */

export class BargeInHandler {
  constructor(voicePipeline) {
    this.voicePipeline = voicePipeline;
    this.isAISpeaking = false;
    this.currentTTSStream = null;
    this.speechDetectionThreshold = 0.5; // Audio level threshold to detect speech
  }

  /**
   * Set AI speaking state
   */
  setAISpeaking(speaking) {
    this.isAISpeaking = speaking;
  }

  /**
   * Detect if user is speaking (barge-in)
   */
  async detectUserSpeech(audioBuffer) {
    if (!this.isAISpeaking) {
      return false; // Don't check if AI isn't speaking
    }

    // Calculate RMS (Root Mean Square) of audio to detect energy
    const rms = this.calculateRMS(audioBuffer);

    // Normalize to 0-1 range
    const normalizedLevel = Math.min(rms / 32768, 1.0);

    // Speech detected if level exceeds threshold
    return normalizedLevel > this.speechDetectionThreshold;
  }

  /**
   * Calculate RMS (loudness) of audio buffer
   */
  calculateRMS(audioBuffer) {
    let sum = 0;
    const view = new Int16Array(audioBuffer);

    for (let i = 0; i < view.length; i++) {
      sum += view[i] * view[i];
    }

    return Math.sqrt(sum / view.length);
  }

  /**
   * Handle barge-in - user interrupted AI
   */
  async handleBargeIn() {
    console.log('🛑 Barge-in detected - stopping AI speech');

    // Stop TTS playback
    this.stopTTSPlayback();

    // Cancel ongoing Gemini request if possible
    this.cancelGeminiRequest();

    // Reset pipeline for new user input
    await this.resetForNewInput();

    return {
      success: true,
      action: 'barge-in-handled',
      message: 'AI speech interrupted, ready for user input'
    };
  }

  /**
   * Stop TTS playback
   */
  stopTTSPlayback() {
    if (this.currentTTSStream) {
      try {
        this.currentTTSStream.destroy();
        this.currentTTSStream = null;
      } catch (error) {
        console.error('Error stopping TTS:', error.message);
      }
    }

    this.isAISpeaking = false;
  }

  /**
   * Cancel Gemini request
   */
  cancelGeminiRequest() {
    // Gemini doesn't support cancellation mid-stream
    // but we can stop listening for responses
    console.log('Cancelling Gemini response processing');
  }

  /**
   * Reset pipeline for new user input
   */
  async resetForNewInput() {
    // Clear any pending responses
    // Reset STT for fresh speech detection
    if (this.voicePipeline?.sttService) {
      this.voicePipeline.sttService.reset();
    }
  }

  /**
   * Configure barge-in sensitivity
   */
  setSpeechDetectionThreshold(threshold) {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.speechDetectionThreshold = threshold;
  }

  /**
   * Get barge-in configuration
   */
  getConfig() {
    return {
      enabled: true,
      speechDetectionThreshold: this.speechDetectionThreshold,
      currentState: {
        isAISpeaking: this.isAISpeaking
      }
    };
  }
}

export default BargeInHandler;
