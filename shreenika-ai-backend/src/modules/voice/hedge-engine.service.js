/**
 * Hedge Engine - Audio Filler System
 *
 * Reduces perceived latency during voice calls by inserting natural-sounding
 * audio fillers (from real sales calls) during LLM processing delays.
 *
 * How it works:
 * 1. Detects when Gemini Live API is thinking (no audio output for >400ms)
 * 2. Inserts brief audio fillers from real sales calls
 * 3. Transitions seamlessly when real response arrives
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class HedgeEngine extends EventEmitter {
  constructor(callId, agentId) {
    super();
    this.callId = callId;
    this.agentId = agentId;

    this.fillerBuffers = [];
    this.currentFillerIndex = 0;

    // Latency tracking
    this.lastGeminiAudioTime = null;
    this.lastUserSpeechTime = null;
    this.fillerInterval = null;

    // Filler playback control
    this.isPlaying = false;
    this.maxFillerDuration = 2000; // 2 seconds max per filler
    this.fillerPlaybackThreshold = 400; // Play filler after 400ms of silence
  }

  /**
   * Initialize audio fillers from PCM files
   * Static method called during voice service initialization
   *
   * @returns {Promise<Array>} - Array of PCM audio buffers
   */
  static async initializeFillers() {
    try {
      const fillersDir = path.join(__dirname, '../../audio/fillers');

      // Check if directory exists
      if (!fs.existsSync(fillersDir)) {
        console.warn(`⚠️  Audio fillers directory not found: ${fillersDir}`);
        return [];
      }

      const files = fs.readdirSync(fillersDir).filter(f => f.endsWith('.pcm'));

      if (files.length === 0) {
        console.warn('⚠️  No PCM audio fillers found in fillers directory');
        return [];
      }

      const fillers = [];

      // Load each PCM filler file
      for (const file of files) {
        try {
          const filePath = path.join(fillersDir, file);
          const buffer = fs.readFileSync(filePath);
          fillers.push(buffer);

          const durationSecs = (buffer.length / 2) / 16000; // PCM 16-bit mono at 16kHz
          console.log(`📻 Loaded filler: ${file} (${(buffer.length / 1024).toFixed(1)}KB, ${durationSecs.toFixed(2)}s)`);
        } catch (err) {
          console.error(`❌ Failed to load filler ${file}:`, err.message);
        }
      }

      if (fillers.length > 0) {
        console.log(`✅ Hedge Engine fillers loaded: ${fillers.length} files ready`);
      }

      return fillers;
    } catch (err) {
      console.error('❌ Hedge Engine initialization failed:', err.message);
      return [];
    }
  }

  /**
   * Mark when Gemini audio was last received
   * Used to detect thinking/processing delays
   */
  markGeminiAudioReceived() {
    this.lastGeminiAudioTime = Date.now();
    this.stopFillerPlayback();
  }

  /**
   * Mark when user speech ended
   * Used to detect when user is done talking
   */
  markUserSpeechEnded() {
    this.lastUserSpeechTime = Date.now();
    this.startFillerPlayback();
  }

  /**
   * Start playing fillers during silence
   * Internal method
   */
  startFillerPlayback() {
    if (this.isPlaying || !this.fillerBuffers || this.fillerBuffers.length === 0) {
      return;
    }

    this.isPlaying = true;

    // Start checking for silence and play fillers
    this.fillerInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastAudio = now - (this.lastGeminiAudioTime || now);

      // If more than threshold ms since last Gemini audio, play a filler
      if (timeSinceLastAudio > this.fillerPlaybackThreshold && this.fillerBuffers.length > 0) {
        const filler = this.fillerBuffers[this.currentFillerIndex];
        this.currentFillerIndex = (this.currentFillerIndex + 1) % this.fillerBuffers.length;

        // Emit filler for playback
        this.emit('playFiller', filler);
      }
    }, this.maxFillerDuration);
  }

  /**
   * Stop playing fillers
   * Called when real Gemini audio arrives
   */
  stopFillerPlayback() {
    if (this.fillerInterval) {
      clearInterval(this.fillerInterval);
      this.fillerInterval = null;
    }
    this.isPlaying = false;
  }

  /**
   * Get next filler in rotation
   *
   * @returns {Buffer|null}
   */
  getNextFiller() {
    if (!this.fillerBuffers || this.fillerBuffers.length === 0) {
      return null;
    }

    const filler = this.fillerBuffers[this.currentFillerIndex];
    this.currentFillerIndex = (this.currentFillerIndex + 1) % this.fillerBuffers.length;
    return filler;
  }

  /**
   * Clean up resources
   */
  close() {
    this.stopFillerPlayback();
    this.fillerBuffers = [];
    this.removeAllListeners();
  }

  /**
   * Get status information
   *
   * @returns {Object}
   */
  getStatus() {
    return {
      callId: this.callId,
      agentId: this.agentId,
      fillerCount: this.fillerBuffers ? this.fillerBuffers.length : 0,
      isPlaying: this.isPlaying,
      timeSinceLastAudio: this.lastGeminiAudioTime ? Date.now() - this.lastGeminiAudioTime : null
    };
  }
}
