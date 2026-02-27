/**
 * Echo Cancellation Service
 * Gap 8: Reduce caller hearing their own voice echoed back
 *
 * Uses a simple adaptive echo canceller based on LMS (Least Mean Squares) algorithm
 * Detects and filters audio that matches recent output from the AI agent
 */

export class EchoCanceller {
  constructor(bufferSize = 4096, adaptationRate = 0.01) {
    this.bufferSize = bufferSize;
    this.adaptationRate = adaptationRate;
    this.echoBuffer = Buffer.alloc(0); // Previous audio sent to caller
    this.filterCoefficients = new Float32Array(256); // FIR filter taps
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.echoDetectionThreshold = 0.3; // Detect correlation > 0.3
  }

  /**
   * Store outgoing audio (what we sent to the caller)
   * This is used to detect echo in incoming audio
   * @param {Buffer} audioBuffer - Audio sent to caller
   */
  storeOutgoingAudio(audioBuffer) {
    // Keep last N samples for echo detection
    const keepSize = Math.min(this.bufferSize, 16384); // Keep up to 16KB
    if (this.echoBuffer.length > keepSize) {
      // Remove oldest data
      this.echoBuffer = this.echoBuffer.slice(this.echoBuffer.length - keepSize);
    }
    // Append new audio
    this.echoBuffer = Buffer.concat([this.echoBuffer, audioBuffer]);
  }

  /**
   * Detect if audio contains echo by correlating with previous outgoing audio
   * @param {Buffer} incomingAudio - Audio from caller
   * @returns {object} - { echoDetected: boolean, echoAmount: 0-1, delay: ms }
   */
  detectEcho(incomingAudio) {
    if (this.echoBuffer.length === 0) {
      return { echoDetected: false, echoAmount: 0, delay: 0 };
    }

    const incomingSamples = this.toFloat32(incomingAudio);
    const echoSamples = this.toFloat32(this.echoBuffer);

    // Calculate cross-correlation at different delays
    let maxCorrelation = 0;
    let bestDelay = 0;

    const maxDelay = Math.min(256, Math.floor(echoSamples.length / 2)); // Check up to 256 samples
    for (let delay = 0; delay < maxDelay; delay++) {
      let correlation = 0;
      let energy1 = 0;
      let energy2 = 0;

      for (let i = 0; i < incomingSamples.length && i + delay < echoSamples.length; i++) {
        const val1 = incomingSamples[i];
        const val2 = echoSamples[i + delay];
        correlation += val1 * val2;
        energy1 += val1 * val1;
        energy2 += val2 * val2;
      }

      // Normalize correlation
      if (energy1 > 0 && energy2 > 0) {
        correlation = correlation / Math.sqrt(energy1 * energy2);
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          bestDelay = delay;
        }
      }
    }

    const echoDetected = maxCorrelation > this.echoDetectionThreshold;
    const delayMs = (bestDelay * 1000) / 16000; // Assuming 16kHz sample rate

    // Track error for adaptation
    this.errorHistory.push(maxCorrelation);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    return {
      echoDetected,
      echoAmount: maxCorrelation,
      delay: Math.round(delayMs),
      bestDelay,
      threshold: this.echoDetectionThreshold
    };
  }

  /**
   * Apply echo cancellation filter to incoming audio
   * @param {Buffer} incomingAudio - Audio from caller
   * @returns {Buffer} - Echo-reduced audio
   */
  cancelEcho(incomingAudio) {
    if (this.echoBuffer.length === 0) {
      return incomingAudio; // No reference signal, can't cancel
    }

    const incomingSamples = this.toFloat32(incomingAudio);
    const echoSamples = this.toFloat32(this.echoBuffer);

    // Apply FIR filter based on stored coefficients
    const outputSamples = new Float32Array(incomingSamples.length);

    for (let i = 0; i < incomingSamples.length; i++) {
      // Predicted echo component
      let predictedEcho = 0;
      for (let j = 0; j < this.filterCoefficients.length && i >= j; j++) {
        predictedEcho += this.filterCoefficients[j] * echoSamples[i - j];
      }

      // Error = input - predicted echo
      const error = incomingSamples[i] - predictedEcho;
      outputSamples[i] = error;

      // Adapt filter coefficients using LMS
      for (let j = 0; j < this.filterCoefficients.length && i >= j; j++) {
        this.filterCoefficients[j] += this.adaptationRate * error * echoSamples[i - j];
      }
    }

    return Buffer.from(outputSamples.buffer);
  }

  /**
   * Convert 16-bit PCM buffer to Float32Array
   * @param {Buffer} buffer - PCM 16-bit buffer
   * @returns {Float32Array} - Normalized float samples [-1, 1]
   */
  toFloat32(buffer) {
    const samples = buffer.length / 2;
    const floatArray = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const sample = buffer.readInt16LE(i * 2);
      floatArray[i] = sample / 32768.0; // Normalize to [-1, 1]
    }

    return floatArray;
  }

  /**
   * Get echo cancellation status
   * @returns {object} - Statistics
   */
  getStatus() {
    const avgError = this.errorHistory.length > 0
      ? this.errorHistory.reduce((a, b) => a + b) / this.errorHistory.length
      : 0;

    return {
      echoBufferSize: this.echoBuffer.length,
      filterCoefficients: this.filterCoefficients.length,
      adaptationRate: this.adaptationRate,
      avgError: avgError.toFixed(4),
      recentErrors: this.errorHistory.slice(-5).map(e => e.toFixed(3)),
      threshold: this.echoDetectionThreshold
    };
  }

  /**
   * Reset echo canceller
   */
  reset() {
    this.echoBuffer = Buffer.alloc(0);
    this.filterCoefficients = new Float32Array(256);
    this.errorHistory = [];
  }
}

export default EchoCanceller;
