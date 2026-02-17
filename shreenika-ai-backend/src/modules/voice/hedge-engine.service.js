/**
 * Hedge Engine Service
 *
 * Latency-Masking State Machine for real-time voice interactions.
 *
 * Problem: Gemini Live has Time to First Byte (TTFB) latency (~400ms).
 * Solution: Play pre-recorded filler audio ("Acha...", "Hmm...") if Gemini takes >400ms.
 * Result: Illusion of instant response, sounds attentive rather than processing.
 *
 * State Machine:
 * 1. User stops speaking → Start 400ms timer
 * 2a. If Gemini sends audio → Kill timer, play Gemini audio (natural flow)
 * 2b. If 400ms expires → Play filler audio, then Gemini audio when it arrives
 *
 * Implementation: setTimeout-based state tracking per call session
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Hedge Engine - Manages latency masking for a single call
 */
export class HedgeEngine {
  constructor(callId, agentId) {
    this.callId = callId;
    this.agentId = agentId;

    // Timer state
    this.hedgeTimer = null;
    this.hedgeThreshold = 400; // milliseconds

    // Filler audio buffers (preloaded at startup)
    this.fillerBuffers = null;
    this.fillerIndex = 0;

    // State tracking
    this.userSpeechEnded = false;
    this.geminiAudioReceived = false;
    this.fillerPlayed = false;

    // Statistics
    this.timingsLog = [];
  }

  /**
   * Initialize filler audio buffers (called once at startup)
   * @static
   * @returns {Promise<Object>} - Map of filler name → buffer
   */
  static async initializeFillers() {
    if (HedgeEngine.fillerCache) {
      return HedgeEngine.fillerCache;
    }

    const fillers = {};
    const fillerDir = resolve('./assets/filler-audio');

    // List of filler audio files (16-bit PCM, 24kHz, Mono, Little-Endian)
    const fillerFiles = [
      'acha.pcm',      // "Acha"
      'hmm.pcm',       // "Hmm"
      'give-me-second.pcm', // "Give me a second"
      'ji.pcm',        // "Ji"
      'okay.pcm'       // "Okay"
    ];

    for (const filename of fillerFiles) {
      try {
        const filePath = resolve(fillerDir, filename);
        fillers[filename] = readFileSync(filePath);
        console.log(`✅ Filler loaded: ${filename} (${fillers[filename].length} bytes)`);
      } catch (err) {
        console.warn(`⚠️ Filler not found: ${filename}`);
        // Continue - fillers are optional (graceful degradation)
      }
    }

    // Cache for reuse
    HedgeEngine.fillerCache = fillers;
    return fillers;
  }

  /**
   * Signal user speech has ended
   * Start countdown to play filler if Gemini is slow
   */
  markUserSpeechEnded() {
    if (this.hedgeTimer) {
      clearTimeout(this.hedgeTimer);
    }

    this.userSpeechEnded = true;
    this.geminiAudioReceived = false;
    this.fillerPlayed = false;

    const startTime = Date.now();
    console.log(`🎙️ [${this.callId}] User speech ended, starting ${this.hedgeThreshold}ms hedge timer`);

    this.hedgeTimer = setTimeout(() => {
      if (!this.geminiAudioReceived && !this.fillerPlayed) {
        console.log(`⏱️ [${this.callId}] Hedge timeout - playing filler audio`);
        this.fillerPlayed = true;
        this.emit('playFiller', this.getNextFiller());
      }
    }, this.hedgeThreshold);
  }

  /**
   * Signal Gemini audio chunk received
   * Kill hedge timer and resume normal flow
   */
  markGeminiAudioReceived() {
    if (this.hedgeTimer) {
      const elapsed = this.hedgeThreshold; // Approximate, timer already fired if here
      clearTimeout(this.hedgeTimer);
      this.hedgeTimer = null;

      const status = this.fillerPlayed ? '(after filler)' : '(within threshold)';
      console.log(`✅ [${this.callId}] Gemini audio received ${status}`);

      this.timingsLog.push({
        timestamp: new Date().toISOString(),
        fillerPlayed: this.fillerPlayed,
        elapsed
      });
    }

    this.geminiAudioReceived = true;
  }

  /**
   * Get next filler audio buffer (round-robin)
   * @returns {Buffer|null}
   */
  getNextFiller() {
    if (!this.fillerBuffers || Object.keys(this.fillerBuffers).length === 0) {
      console.warn(`⚠️ No filler audio available`);
      return null;
    }

    const fillers = Object.values(this.fillerBuffers);
    const filler = fillers[this.fillerIndex % fillers.length];
    this.fillerIndex++;

    return filler;
  }

  /**
   * Get statistics for this hedge engine session
   * @returns {Object}
   */
  getStats() {
    return {
      callId: this.callId,
      fillerPlayed: this.fillerPlayed,
      fillerCount: this.fillerIndex,
      timingsLog: this.timingsLog
    };
  }

  /**
   * Clean up resources
   */
  close() {
    if (this.hedgeTimer) {
      clearTimeout(this.hedgeTimer);
    }
    console.log(`🛑 [${this.callId}] Hedge engine closed`);
  }
}

// Simple event emitter mixin
HedgeEngine.prototype.emit = function(eventName, data) {
  if (!this._listeners) this._listeners = {};
  const listeners = this._listeners[eventName] || [];
  listeners.forEach(cb => cb(data));
};

HedgeEngine.prototype.on = function(eventName, callback) {
  if (!this._listeners) this._listeners = {};
  if (!this._listeners[eventName]) this._listeners[eventName] = [];
  this._listeners[eventName].push(callback);
};

// Static cache for filler buffers
HedgeEngine.fillerCache = null;

export default HedgeEngine;
