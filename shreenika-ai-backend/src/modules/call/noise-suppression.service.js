/**
 * Noise Suppression Service
 * Gap 9: Remove background noise from caller audio using spectral subtraction
 *
 * Uses Spectral Subtraction algorithm to reduce background noise
 * Learns noise profile from non-speech segments
 */

export class NoiseSuppressor {
  constructor(fftSize = 512, noiseAdaptation = 0.98) {
    this.fftSize = fftSize;
    this.hopSize = fftSize / 4; // 75% overlap
    this.noiseAdaptation = noiseAdaptation; // How quickly noise profile adapts
    this.noiseSpectrum = new Float32Array(fftSize / 2);
    this.noiseLearning = true;
    this.noiseLearningTime = 500; // Learn noise for first 500ms
    this.startTime = Date.now();
    this.overlapBuffer = Buffer.alloc(0);
    this.noiseGate = 0.02; // Below 2% of max amplitude = likely noise
  }

  /**
   * Suppress noise from audio buffer
   * @param {Buffer} audioBuffer - Audio from caller
   * @returns {Buffer} - Noise-suppressed audio
   */
  suppressNoise(audioBuffer) {
    // Check if still in noise learning phase
    const elapsed = Date.now() - this.startTime;
    if (elapsed < this.noiseLearningTime && this.noiseLearning) {
      // Still learning noise profile
      this.updateNoiseProfile(audioBuffer);
      return audioBuffer; // Return original audio during learning
    } else if (elapsed >= this.noiseLearningTime && this.noiseLearning) {
      this.noiseLearning = false;
      console.log(`✅ Noise suppression: Learning complete. Noise profile learned.`);
    }

    return this.applySpectralSubtraction(audioBuffer);
  }

  /**
   * Update noise profile (learn background noise)
   * @param {Buffer} audioBuffer - Audio frame
   */
  updateNoiseProfile(audioBuffer) {
    const samples = this.toFloat32(audioBuffer);
    const fft = this.computeFFT(samples);

    // Smooth update to noise spectrum
    for (let i = 0; i < fft.length; i++) {
      const magnitude = Math.abs(fft[i]);
      // Update with exponential smoothing
      this.noiseSpectrum[i] = this.noiseAdaptation * this.noiseSpectrum[i] +
                               (1 - this.noiseAdaptation) * magnitude;
    }
  }

  /**
   * Apply spectral subtraction to reduce noise
   * @param {Buffer} audioBuffer - Audio frame
   * @returns {Buffer} - Denoised audio
   */
  applySpectralSubtraction(audioBuffer) {
    const samples = this.toFloat32(audioBuffer);

    // Process with FFT
    const fft = this.computeFFT(samples);
    const magnitude = new Float32Array(fft.length);
    const phase = new Float32Array(fft.length);

    // Extract magnitude and phase
    for (let i = 0; i < fft.length; i++) {
      magnitude[i] = Math.abs(fft[i]);
      phase[i] = Math.atan2(fft[i].imag || 0, fft[i].real || fft[i]);
    }

    // Spectral subtraction
    const denoised = new Float32Array(fft.length);
    for (let i = 0; i < fft.length; i++) {
      // Subtract noise spectrum with over-subtraction factor
      const overSubtraction = 1.5; // Aggressive noise reduction
      let cleanMagnitude = magnitude[i] - overSubtraction * this.noiseSpectrum[i];

      // Ensure non-negative magnitude (spectral floor)
      cleanMagnitude = Math.max(cleanMagnitude, 0.1 * magnitude[i]); // Keep 10% of original

      // Reconstruct complex number
      denoised[i] = {
        real: cleanMagnitude * Math.cos(phase[i]),
        imag: cleanMagnitude * Math.sin(phase[i])
      };
    }

    // Inverse FFT back to time domain
    const denoisedSamples = this.computeIFFT(denoised);

    // Apply window to reduce artifacts
    const window = this.getHannWindow(denoisedSamples.length);
    for (let i = 0; i < denoisedSamples.length; i++) {
      denoisedSamples[i] *= window[i];
    }

    return this.toBuffer(denoisedSamples);
  }

  /**
   * Compute FFT using Cooley-Tukey algorithm
   * For production, use a proper FFT library like fftjs
   * @param {Float32Array} samples - Input samples
   * @returns {object[]} - Complex FFT output
   */
  computeFFT(samples) {
    // Simplified FFT - in production use fftjs or ml.js
    // This is a placeholder that returns frequency representation
    const fftSize = this.fftSize;
    const output = new Array(fftSize / 2).fill(0).map(() => ({
      real: 0,
      imag: 0
    }));

    // Basic DFT (slow but correct)
    for (let k = 0; k < fftSize / 2; k++) {
      let real = 0, imag = 0;
      for (let n = 0; n < samples.length; n++) {
        const angle = -2 * Math.PI * k * n / fftSize;
        real += samples[n] * Math.cos(angle);
        imag += samples[n] * Math.sin(angle);
      }
      output[k] = { real: real / fftSize, imag: imag / fftSize };
    }

    return output;
  }

  /**
   * Compute Inverse FFT
   * @param {object[]} spectrum - FFT output
   * @returns {Float32Array} - Time-domain samples
   */
  computeIFFT(spectrum) {
    const size = spectrum.length * 2;
    const output = new Float32Array(size);

    for (let n = 0; n < size; n++) {
      let real = 0, imag = 0;
      for (let k = 0; k < spectrum.length; k++) {
        const angle = 2 * Math.PI * k * n / size;
        real += spectrum[k].real * Math.cos(angle) - spectrum[k].imag * Math.sin(angle);
        imag += spectrum[k].real * Math.sin(angle) + spectrum[k].imag * Math.cos(angle);
      }
      output[n] = real; // Take real part only
    }

    return output;
  }

  /**
   * Get Hann window for overlap-add
   * @param {number} size - Window size
   * @returns {Float32Array} - Window coefficients
   */
  getHannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1));
    }
    return window;
  }

  /**
   * Convert 16-bit PCM to Float32
   * @param {Buffer} buffer - PCM buffer
   * @returns {Float32Array} - Normalized samples
   */
  toFloat32(buffer) {
    const samples = buffer.length / 2;
    const floatArray = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const sample = buffer.readInt16LE(i * 2);
      floatArray[i] = sample / 32768.0;
    }

    return floatArray;
  }

  /**
   * Convert Float32 to 16-bit PCM
   * @param {Float32Array} samples - Float samples
   * @returns {Buffer} - PCM buffer
   */
  toBuffer(samples) {
    const buffer = Buffer.alloc(samples.length * 2);

    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i])); // Clamp
      const pcm = sample < 0
        ? sample * 0x8000
        : sample * 0x7FFF;
      buffer.writeInt16LE(Math.round(pcm), i * 2);
    }

    return buffer;
  }

  /**
   * Get noise suppression status
   * @returns {object} - Status info
   */
  getStatus() {
    return {
      noiseLearning: this.noiseLearning,
      noiseLearningProgress: Math.round((Date.now() - this.startTime) / this.noiseLearningTime * 100),
      fftSize: this.fftSize,
      noiseSpectrumAvg: (this.noiseSpectrum.reduce((a, b) => a + b, 0) / this.noiseSpectrum.length).toFixed(4),
      noiseAdaptation: this.noiseAdaptation
    };
  }

  /**
   * Reset noise suppression
   */
  reset() {
    this.noiseSpectrum = new Float32Array(this.fftSize / 2);
    this.noiseLearning = true;
    this.startTime = Date.now();
    this.overlapBuffer = Buffer.alloc(0);
  }
}

export default NoiseSuppressor;
