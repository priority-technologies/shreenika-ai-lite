/**
 * Call Timeout Service
 * Gap 22: Prevent calls from hanging indefinitely
 *
 * Monitors call activity and enforces timeouts:
 * - Total call duration timeout
 * - Silence timeout (no audio for N seconds)
 * - No response timeout (waiting for Gemini response)
 */

export class CallTimeout {
  constructor(maxDuration = 600000, silenceTimeout = 30000, responseTimeout = 30000) {
    this.maxDuration = maxDuration; // Max total call duration (ms)
    this.silenceTimeout = silenceTimeout; // Max silence before hanging up
    this.responseTimeout = responseTimeout; // Max time waiting for agent response

    this.startTime = Date.now();
    this.lastAudioTime = this.startTime;
    this.lastResponseTime = this.startTime;
    this.callActive = true;

    this.timeoutHandles = {
      duration: null,
      silence: null,
      response: null
    };

    this.timeoutCallbacks = [];
    this.statistics = {
      timeoutType: null,
      reason: null,
      duration: 0,
      lastAudioAge: 0
    };
  }

  /**
   * Start timeout monitoring
   */
  start() {
    // Total duration timeout
    this.timeoutHandles.duration = setTimeout(() => {
      this.triggerTimeout('DURATION', `Call exceeded maximum duration (${this.maxDuration}ms)`);
    }, this.maxDuration);

    // Silence timeout (start monitoring)
    this.resetSilenceTimer();

    console.log(`⏱️  Call timeouts configured:`);
    console.log(`   ├─ Max duration: ${this.maxDuration / 1000}s`);
    console.log(`   ├─ Silence timeout: ${this.silenceTimeout / 1000}s`);
    console.log(`   └─ Response timeout: ${this.responseTimeout / 1000}s`);
  }

  /**
   * Record audio activity (reset silence timer)
   */
  recordAudioActivity() {
    this.lastAudioTime = Date.now();
    this.resetSilenceTimer();
  }

  /**
   * Record response received from agent (reset response timer)
   */
  recordResponse() {
    this.lastResponseTime = Date.now();
    if (this.timeoutHandles.response) {
      clearTimeout(this.timeoutHandles.response);
    }
    // Start new response timer
    this.timeoutHandles.response = setTimeout(() => {
      this.triggerTimeout('RESPONSE', `No response from agent for ${this.responseTimeout}ms`);
    }, this.responseTimeout);
  }

  /**
   * Reset silence timer
   */
  resetSilenceTimer() {
    if (this.timeoutHandles.silence) {
      clearTimeout(this.timeoutHandles.silence);
    }

    this.timeoutHandles.silence = setTimeout(() => {
      const silenceDuration = Date.now() - this.lastAudioTime;
      this.triggerTimeout('SILENCE', `No audio detected for ${silenceDuration}ms`);
    }, this.silenceTimeout);
  }

  /**
   * Check current timeout status
   * @returns {object} - Status info
   */
  getStatus() {
    const now = Date.now();
    const totalDuration = now - this.startTime;
    const timeSinceLastAudio = now - this.lastAudioTime;
    const timeSinceLastResponse = now - this.lastResponseTime;

    return {
      callActive: this.callActive,
      totalDuration: totalDuration,
      maxDuration: this.maxDuration,
      durationRemaining: Math.max(0, this.maxDuration - totalDuration),
      timeSinceLastAudio: timeSinceLastAudio,
      silenceTimeout: this.silenceTimeout,
      silenceRemaining: Math.max(0, this.silenceTimeout - timeSinceLastAudio),
      timeSinceLastResponse: timeSinceLastResponse,
      responseTimeout: this.responseTimeout,
      responseRemaining: Math.max(0, this.responseTimeout - timeSinceLastResponse),
      willExpireIn: {
        duration: Math.ceil((this.maxDuration - totalDuration) / 1000) + 's',
        silence: Math.ceil((this.silenceTimeout - timeSinceLastAudio) / 1000) + 's',
        response: Math.ceil((this.responseTimeout - timeSinceLastResponse) / 1000) + 's'
      }
    };
  }

  /**
   * Register timeout callback
   * @param {function} callback - Called on timeout
   */
  onTimeout(callback) {
    this.timeoutCallbacks.push(callback);
  }

  /**
   * Trigger timeout event
   * @param {string} type - DURATION|SILENCE|RESPONSE
   * @param {string} reason - Reason for timeout
   */
  triggerTimeout(type, reason) {
    if (!this.callActive) return; // Already timed out

    this.callActive = false;
    const duration = Date.now() - this.startTime;

    this.statistics = {
      timeoutType: type,
      reason: reason,
      duration: duration,
      lastAudioAge: Date.now() - this.lastAudioTime,
      timestamp: new Date().toISOString()
    };

    console.warn(`⏱️  TIMEOUT TRIGGERED [${type}]: ${reason} (call duration: ${duration}ms)`);

    // Execute all timeout callbacks
    this.timeoutCallbacks.forEach(cb => {
      try {
        cb({
          type,
          reason,
          duration,
          statistics: this.statistics
        });
      } catch (err) {
        console.error(`❌ Error in timeout callback: ${err.message}`);
      }
    });

    // Clear all timers
    this.stop();
  }

  /**
   * Stop timeout monitoring (call ended normally)
   */
  stop() {
    Object.values(this.timeoutHandles).forEach(handle => {
      if (handle) clearTimeout(handle);
    });
    this.callActive = false;
    console.log(`✅ Call timeout monitoring stopped`);
  }

  /**
   * Update timeout values
   * @param {object} config - { maxDuration, silenceTimeout, responseTimeout }
   */
  updateConfig(config) {
    if (config.maxDuration) this.maxDuration = config.maxDuration;
    if (config.silenceTimeout) this.silenceTimeout = config.silenceTimeout;
    if (config.responseTimeout) this.responseTimeout = config.responseTimeout;
    console.log(`🔧 Call timeout config updated:`, config);
  }

  /**
   * Get timeout statistics
   * @returns {object} - Statistics
   */
  getStatistics() {
    return this.statistics;
  }
}

export default CallTimeout;
