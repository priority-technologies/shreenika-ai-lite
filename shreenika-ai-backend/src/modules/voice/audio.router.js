/**
 * Audio Router - Routes Gemini audio output back to caller
 *
 * Handles audio delivery for:
 * - Twilio Media Streams (mulaw 8kHz → base64)
 * - SansPBX AudioSocket (PCM 8kHz → base64)
 *
 * Responsibilities:
 * - Convert Gemini 24kHz PCM to provider-specific format
 * - Send audio chunks via appropriate WebSocket channel
 * - Track audio delivery metrics
 * - Handle transmission errors gracefully
 */

import { geminiToTwilio, downsample24kTo8k, createTwilioMediaMessage } from '../call/audio.converter.js';

export class AudioRouter {
  /**
   * Create an audio router for a specific provider
   * @param {string} provider - 'twilio' or 'sanspbx'
   * @param {object} options - Provider-specific options
   */
  constructor(provider, options = {}) {
    this.provider = provider;
    this.streamSid = options.streamSid || null;
    this.sansPbxMetadata = options.sansPbxMetadata || null;
    this.ws = options.ws || null;

    // Metrics
    this.audioChunksSent = 0;
    this.audioChunksFailed = 0;
    this.totalBytesSent = 0;
    this.startTime = Date.now();
  }

  /**
   * Route Gemini audio chunk to the caller
   * @param {Buffer} geminiAudioBuffer - PCM 24kHz audio from Gemini
   * @returns {boolean} - True if successfully sent, false if failed
   */
  routeAudio(geminiAudioBuffer) {
    if (!geminiAudioBuffer || geminiAudioBuffer.length === 0) {
      console.warn(`⚠️ AudioRouter: Empty audio buffer received`);
      return false;
    }

    try {
      if (this.provider === 'twilio') {
        return this._routeToTwilio(geminiAudioBuffer);
      } else if (this.provider === 'sanspbx') {
        return this._routeToSansPBX(geminiAudioBuffer);
      } else {
        console.error(`❌ AudioRouter: Unknown provider: ${this.provider}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ AudioRouter error (${this.provider}):`, error.message);
      this.audioChunksFailed++;
      return false;
    }
  }

  /**
   * Route audio to Twilio Media Streams
   * @private
   * @param {Buffer} pcm24k - Gemini audio (PCM 24kHz)
   * @returns {boolean}
   */
  _routeToTwilio(pcm24k) {
    if (!this.ws || this.ws.readyState !== 1) {
      console.warn(`⚠️ Twilio WebSocket not OPEN - state=${this.ws?.readyState || 'null'}`);
      this.audioChunksFailed++;
      return false;
    }

    try {
      // Convert Gemini 24kHz → Twilio mulaw 8kHz base64
      const base64Audio = geminiToTwilio(pcm24k);

      // Create Twilio media message
      const mediaMessage = createTwilioMediaMessage(this.streamSid, base64Audio);

      // Send to Twilio
      this.ws.send(JSON.stringify(mediaMessage));

      // Track metrics
      this.audioChunksSent++;
      this.totalBytesSent += pcm24k.length;

      // Log at lower verbosity (only first few and periodic)
      if (this.audioChunksSent <= 3 || this.audioChunksSent % 20 === 0) {
        const KB = (pcm24k.length / 1024).toFixed(2);
        console.log(`📤 Twilio audio #${this.audioChunksSent}: ${KB} KB sent, total ${this.totalBytesSent} bytes`);
      }

      return true;
    } catch (error) {
      console.error(`❌ Twilio audio routing failed:`, error.message);
      this.audioChunksFailed++;
      return false;
    }
  }

  /**
   * Route audio to SansPBX AudioSocket
   * @private
   * @param {Buffer} pcm24k - Gemini audio (PCM 24kHz)
   * @returns {boolean}
   */
  _routeToSansPBX(pcm24k) {
    if (!this.ws || this.ws.readyState !== 1) {
      console.warn(`⚠️ SansPBX WebSocket not OPEN - state=${this.ws?.readyState || 'null'}`);
      this.audioChunksFailed++;
      return false;
    }

    if (!this.sansPbxMetadata) {
      console.error(`❌ SansPBX metadata not initialized`);
      this.audioChunksFailed++;
      return false;
    }

    try {
      // Convert Gemini 24kHz → SansPBX 8kHz PCM Linear
      const pcm8k = downsample24kTo8k(pcm24k);

      // Encode to base64 (NOT mulaw)
      const base64Audio = pcm8k.toString('base64');

      // Create reverse-media event (SansPBX format)
      const reverseMediaEvent = {
        event: 'reverse-media',
        payload: base64Audio,
        streamId: this.sansPbxMetadata.streamId,
        channelId: this.sansPbxMetadata.channelId,
        callId: this.sansPbxMetadata.callId
      };

      // Send to SansPBX
      this.ws.send(JSON.stringify(reverseMediaEvent));

      // Track metrics
      this.audioChunksSent++;
      this.totalBytesSent += pcm24k.length;

      // Log at lower verbosity
      if (this.audioChunksSent <= 3 || this.audioChunksSent % 20 === 0) {
        const KB = (pcm24k.length / 1024).toFixed(2);
        console.log(`📤 SansPBX audio #${this.audioChunksSent}: ${KB} KB sent, total ${this.totalBytesSent} bytes`);
      }

      return true;
    } catch (error) {
      console.error(`❌ SansPBX audio routing failed:`, error.message);
      this.audioChunksFailed++;
      return false;
    }
  }

  /**
   * Get routing metrics
   * @returns {object}
   */
  getMetrics() {
    const elapsedMs = Date.now() - this.startTime;
    const successRate = this.audioChunksSent > 0
      ? ((this.audioChunksSent / (this.audioChunksSent + this.audioChunksFailed)) * 100).toFixed(1)
      : 0;

    return {
      provider: this.provider,
      audioChunksSent: this.audioChunksSent,
      audioChunksFailed: this.audioChunksFailed,
      successRate: `${successRate}%`,
      totalBytesSent: this.totalBytesSent,
      totalKBSent: (this.totalBytesSent / 1024).toFixed(2),
      elapsedMs,
      averageBytesPerChunk: this.audioChunksSent > 0 ? Math.round(this.totalBytesSent / this.audioChunksSent) : 0
    };
  }

  /**
   * Get summary for logging
   * @returns {string}
   */
  getSummary() {
    const metrics = this.getMetrics();
    return `📊 AudioRouter [${metrics.provider}]: ${metrics.audioChunksSent} chunks, ` +
           `${metrics.totalKBSent} KB, success rate ${metrics.successRate}, ` +
           `${metrics.elapsedMs}ms elapsed`;
  }
}

export default AudioRouter;
