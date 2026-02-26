/**
 * AudioWorklet Processor for Raw PCM Audio Capture
 *
 * This processor captures raw PCM audio samples from the microphone
 * and sends them to the main thread via MessagePort
 *
 * Fixes MediaRecorder container format issue by working with raw samples
 */

class RawPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Accumulate samples before sending
    this.sampleBuffer = new Float32Array(this.bufferSize);
    this.sampleIndex = 0;
    this.sampleRate = sampleRate; // From AudioWorkletProcessor context

    console.log(`[AudioWorklet] RawPCMProcessor initialized at ${this.sampleRate}Hz`);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Get first channel (mono)
    if (input.length === 0) return true;

    const channel = input[0];

    // Accumulate samples
    for (let i = 0; i < channel.length; i++) {
      this.sampleBuffer[this.sampleIndex] = channel[i];
      this.sampleIndex++;

      // Send buffer when full (16KB chunks)
      if (this.sampleIndex >= this.bufferSize) {
        // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
        const int16Array = this.float32ToInt16(
          this.sampleBuffer.slice(0, this.sampleIndex)
        );

        // FIX: Send Int16Array.buffer (ArrayBuffer) instead of Buffer.from()
        // AudioWorklet runs in Web Worker context (no Node.js Buffer API)
        // Main thread will convert ArrayBuffer to base64
        this.port.postMessage({
          type: 'audio',
          data: int16Array.buffer, // Send ArrayBuffer directly
          sampleRate: this.sampleRate,
          format: 'pcm16'
        });

        // Reset buffer
        this.sampleBuffer = new Float32Array(this.bufferSize);
        this.sampleIndex = 0;
      }
    }

    return true; // Keep processor alive
  }

  /**
   * Convert Float32 audio samples to Int16 (16-bit signed PCM)
   * @param {Float32Array} float32Samples - Samples in range [-1, 1]
   * @returns {Int16Array} - 16-bit signed PCM samples
   */
  float32ToInt16(float32Samples) {
    const int16Samples = new Int16Array(float32Samples.length);

    for (let i = 0; i < float32Samples.length; i++) {
      // Clamp to [-1, 1]
      let sample = Math.max(-1, Math.min(1, float32Samples[i]));

      // Convert to 16-bit signed integer
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      int16Samples[i] = Math.round(sample);
    }

    return int16Samples; // Return Int16Array directly
  }
}

registerProcessor('raw-pcm-processor', RawPCMProcessor);
