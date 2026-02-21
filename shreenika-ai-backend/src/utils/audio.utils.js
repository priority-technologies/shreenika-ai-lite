/**
 * audio.utils.js
 * ============================================================
 * Audio processing utilities
 * PCM encoding, VAD, resampling, format conversion
 *
 * Author: Claude Code
 * Date: 2026-02-23
 */

/**
 * Voice Activity Detection (VAD)
 * Detects if audio contains speech
 */
class VADEngine {
  constructor(options = {}) {
    this.silenceThreshold = options.silenceThreshold || 500; // ms
    this.energyThreshold = options.energyThreshold || -40; // dB
    this.checkInterval = options.checkInterval || 100; // ms
    this.onSilenceDetected = options.onSilenceDetected || null;

    this.lastAudioTime = Date.now();
    this.vadInterval = null;
  }

  /**
   * Process audio chunk for VAD
   */
  process(audioBuffer) {
    const energy = this._calculateEnergy(audioBuffer);

    if (energy > this.energyThreshold) {
      // Speech detected
      this.lastAudioTime = Date.now();
    }
  }

  /**
   * Start VAD monitoring
   */
  start() {
    this.lastAudioTime = Date.now();

    this.vadInterval = setInterval(() => {
      const silenceDuration = Date.now() - this.lastAudioTime;

      if (silenceDuration > this.silenceThreshold) {
        if (this.onSilenceDetected) {
          this.onSilenceDetected(silenceDuration);
        }
      }
    }, this.checkInterval);
  }

  /**
   * Stop VAD monitoring
   */
  stop() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
    }
  }

  /**
   * Calculate audio energy in dB
   */
  _calculateEnergy(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) {
      return -Infinity;
    }

    // Convert buffer to 16-bit PCM samples
    const samples = this._bufferToSamples(audioBuffer);

    // Calculate RMS (Root Mean Square)
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }

    const rms = Math.sqrt(sum / samples.length);

    // Convert to dB (20 * log10(rms))
    const db = 20 * Math.log10(rms || 0.001); // Avoid log(0)

    return db;
  }

  /**
   * Convert buffer to 16-bit PCM samples
   */
  _bufferToSamples(buffer) {
    const samples = [];
    const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    for (let i = 0; i < buffer.length; i += 2) {
      // Read 16-bit signed integer (little-endian)
      const sample = dataView.getInt16(i, true) / 32768.0; // Normalize to -1.0 to 1.0
      samples.push(Math.abs(sample));
    }

    return samples;
  }
}

/**
 * Audio format conversions and utilities
 */
class AudioConverter {
  /**
   * Resample audio from 48kHz to 16kHz
   * Used for converting browser/phone audio to Gemini format
   */
  static resample48kHzTo16kHz(audioBuffer) {
    const inputSampleRate = 48000;
    const outputSampleRate = 16000;
    const ratio = outputSampleRate / inputSampleRate;

    const inputLength = audioBuffer.length;
    const outputLength = Math.ceil(inputLength * ratio);

    const inputArray = new Int16Array(audioBuffer);
    const outputArray = new Int16Array(outputLength);

    // Simple linear interpolation resampling
    for (let i = 0; i < outputLength; i++) {
      const position = i / ratio;
      const index = Math.floor(position);
      const nextIndex = Math.min(index + 1, inputLength - 1);
      const fraction = position - index;

      const sample1 = inputArray[index] || 0;
      const sample2 = inputArray[nextIndex] || 0;

      outputArray[i] = Math.round(sample1 + (sample2 - sample1) * fraction);
    }

    return Buffer.from(outputArray);
  }

  /**
   * Resample audio from 44.1kHz to 16kHz
   * Used for audio file input
   */
  static resample44100To16kHz(audioBuffer) {
    const inputSampleRate = 44100;
    const outputSampleRate = 16000;
    const ratio = outputSampleRate / inputSampleRate;

    const inputLength = audioBuffer.length / 2; // Divide by 2 because buffer is in bytes
    const outputLength = Math.ceil(inputLength * ratio);

    const inputArray = new Int16Array(audioBuffer);
    const outputArray = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const position = i / ratio;
      const index = Math.floor(position);
      const nextIndex = Math.min(index + 1, inputLength - 1);
      const fraction = position - index;

      const sample1 = inputArray[index] || 0;
      const sample2 = inputArray[nextIndex] || 0;

      outputArray[i] = Math.round(sample1 + (sample2 - sample1) * fraction);
    }

    return Buffer.from(outputArray);
  }

  /**
   * Convert Gemini Live native audio (24kHz) to standard 16kHz PCM
   */
  static resample24kHzTo16kHz(audioBuffer) {
    const inputSampleRate = 24000;
    const outputSampleRate = 16000;
    const ratio = outputSampleRate / inputSampleRate;

    const inputArray = new Int16Array(audioBuffer);
    const inputLength = inputArray.length;
    const outputLength = Math.ceil(inputLength * ratio);

    const outputArray = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const position = i / ratio;
      const index = Math.floor(position);
      const nextIndex = Math.min(index + 1, inputLength - 1);
      const fraction = position - index;

      const sample1 = inputArray[index] || 0;
      const sample2 = inputArray[nextIndex] || 0;

      outputArray[i] = Math.round(sample1 + (sample2 - sample1) * fraction);
    }

    return Buffer.from(outputArray);
  }

  /**
   * Downsample from any rate to 16kHz
   */
  static downsampleTo16kHz(audioBuffer, currentSampleRate) {
    if (currentSampleRate === 16000) {
      return audioBuffer;
    }

    switch (currentSampleRate) {
      case 48000:
        return this.resample48kHzTo16kHz(audioBuffer);
      case 44100:
        return this.resample44100To16kHz(audioBuffer);
      case 24000:
        return this.resample24kHzTo16kHz(audioBuffer);
      default:
        console.warn(`Unsupported sample rate: ${currentSampleRate}`);
        return audioBuffer;
    }
  }

  /**
   * Convert audio to base64 for transmission
   */
  static toBase64(audioBuffer) {
    return audioBuffer.toString('base64');
  }

  /**
   * Convert base64 audio back to buffer
   */
  static fromBase64(base64String) {
    return Buffer.from(base64String, 'base64');
  }

  /**
   * Normalize audio volume
   */
  static normalize(audioBuffer, targetLevel = -20) {
    // targetLevel in dB (e.g., -20 dB for normalized audio)
    const currentLevel = this._measureLevel(audioBuffer);
    const gainDb = targetLevel - currentLevel;
    const gainLinear = Math.pow(10, gainDb / 20);

    const samples = new Int16Array(audioBuffer);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.max(-32768, Math.min(32767, samples[i] * gainLinear));
    }

    return Buffer.from(samples);
  }

  /**
   * Measure audio level in dB
   */
  static _measureLevel(audioBuffer) {
    const samples = new Int16Array(audioBuffer);
    let sum = 0;

    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768.0;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / samples.length);
    return 20 * Math.log10(rms || 0.001);
  }

  /**
   * Add silence padding to audio buffer
   */
  static padWithSilence(audioBuffer, paddingMs, sampleRate = 16000) {
    const paddingSamples = Math.round(sampleRate * (paddingMs / 1000));
    const paddingBuffer = Buffer.alloc(paddingSamples * 2); // 16-bit = 2 bytes per sample

    return Buffer.concat([audioBuffer, paddingBuffer]);
  }

  /**
   * Trim silence from beginning of audio
   */
  static trimSilence(audioBuffer, threshold = -40) {
    const samples = new Int16Array(audioBuffer);
    let startIndex = 0;

    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768.0;
      const db = 20 * Math.log10(Math.abs(normalized) || 0.001);

      if (db > threshold) {
        startIndex = Math.max(0, i - 100); // Small buffer before first sound
        break;
      }
    }

    return Buffer.from(samples.slice(startIndex));
  }
}

/**
 * Audio format detector
 */
class AudioFormatDetector {
  /**
   * Detect audio format from buffer
   */
  static detectFormat(audioBuffer) {
    // WAV format detection
    if (audioBuffer.length > 12) {
      const riffHeader = audioBuffer.toString('ascii', 0, 4);
      if (riffHeader === 'RIFF') {
        const waveHeader = audioBuffer.toString('ascii', 8, 12);
        if (waveHeader === 'WAVE') {
          return { format: 'wav', confidence: 0.95 };
        }
      }
    }

    // MP3 detection (ID3 tag or frame sync)
    if (audioBuffer.length > 3) {
      const id3Header = audioBuffer.toString('ascii', 0, 3);
      if (id3Header === 'ID3') {
        return { format: 'mp3', confidence: 0.95 };
      }

      // MP3 frame sync (0xFF 0xFB or 0xFF 0xFA)
      if (audioBuffer[0] === 0xFF && (audioBuffer[1] === 0xFB || audioBuffer[1] === 0xFA)) {
        return { format: 'mp3', confidence: 0.85 };
      }
    }

    // OGG/Vorbis detection
    if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
      return { format: 'ogg', confidence: 0.95 };
    }

    // AAC detection
    if (audioBuffer[0] === 0xFF && audioBuffer[1] === 0xF1) {
      return { format: 'aac', confidence: 0.85 };
    }

    // Default: assume PCM (most common for raw audio)
    return { format: 'pcm', confidence: 0.5 };
  }

  /**
   * Detect sample rate from audio buffer
   */
  static detectSampleRate(audioBuffer) {
    // This is a heuristic - without format metadata, detection is difficult
    // Common sample rates: 8000, 16000, 22050, 44100, 48000

    const commonRates = [8000, 16000, 22050, 44100, 48000];

    // Try to detect from WAV/MP3 metadata if available
    // For now, assume 16kHz (most common for voice)
    return 16000;
  }
}

module.exports = {
  VADEngine,
  AudioConverter,
  AudioFormatDetector
};
