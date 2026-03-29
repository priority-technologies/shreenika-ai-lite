'use strict';
/**
 * SttService — Google Cloud Speech-to-Text Streaming
 *
 * Side-channel only — never touches the Gemini audio path.
 * Purpose: transcribe caller speech to text so that:
 *   1. Call transcript is populated (Human: / Agent: turns)
 *   2. Audio cache fingerprinting works (phrase → SHA256 → GCS lookup)
 *
 * Usage (per call):
 *   const stt = new SttService({ languageCode: 'hi-IN' });
 *   stt.on('transcript', ({ text, isFinal }) => { ... });
 *   stt.write(pcm16Buffer);   // 16kHz PCM16 mono chunks
 *   stt.destroy();            // on call end
 *
 * Audio requirements:
 *   - Encoding: LINEAR16 (raw PCM)
 *   - Sample rate: 16000 Hz
 *   - Channels: 1 (mono)
 *   - Chunk size: any (typically 20ms = 640 bytes)
 *
 * Limits:
 *   - Google STT streaming session max = 5 minutes
 *   - Auto-restarts every 4 min 50 sec to avoid hitting the limit
 */

const { EventEmitter } = require('events');
const logger = require('./logger');

const RESTART_INTERVAL_MS = 290_000; // 4 min 50 sec — restart before 5 min limit

class SttService extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} [opts.languageCode='hi-IN']   BCP-47 language code
   * @param {string} [opts.model='phone_call']      STT model ('phone_call' or 'default')
   */
  constructor(opts = {}) {
    super();
    this.languageCode  = opts.languageCode || 'hi-IN';
    this.model         = opts.model || 'phone_call';
    this._destroyed    = false;
    this._client       = null;
    this._stream       = null;
    this._restartTimer = null;
    this._pendingChunks = []; // buffer chunks received before stream is ready
    this._errorCount   = 0;   // circuit breaker — stop after 5 consecutive auth errors
  }

  // ── Lazy-init the Speech client ──────────────────────────────────────────────
  _getClient() {
    if (this._client) return this._client;
    try {
      const { SpeechClient } = require('@google-cloud/speech');
      // Use Application Default Credentials (ADC) — Cloud Run provides these automatically
      // via the instance metadata server. Do NOT pass keyFilename here — the Vertex AI
      // service account (gen-lang-client SA) does not have Speech API IAM role, causing
      // GoogleToken._requestToken failures in a tight loop.
      this._client = new SpeechClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'gen-lang-client-0348687456',
      });
    } catch (e) {
      logger.warn('[STT] SpeechClient init failed — STT side-channel disabled:', e.message);
      this._client = null;
    }
    return this._client;
  }

  // ── Start (or restart) the streaming recognition session ────────────────────
  start() {
    if (this._destroyed) return;
    const client = this._getClient();
    if (!client) return; // STT unavailable — silently disabled

    try {
      const request = {
        config: {
          encoding:                    'LINEAR16',
          sampleRateHertz:             16000,
          audioChannelCount:           1,
          languageCode:                this.languageCode,
          model:                       this.model,
          useEnhanced:                 true,
          enableAutomaticPunctuation:  true,
          // Alternative languages improve accuracy for code-switching (Hinglish)
          alternativeLanguageCodes:    this.languageCode.startsWith('hi') ? ['en-IN'] : [],
        },
        interimResults: false // final results only — keeps transcript clean
      };

      this._stream = client.streamingRecognize(request);

      this._stream.on('data', (response) => {
        try {
          const result = response.results?.[0];
          if (!result) return;
          const transcript = result.alternatives?.[0]?.transcript?.trim();
          if (!transcript) return;
          this.emit('transcript', {
            text:    transcript,
            isFinal: result.isFinal
          });
        } catch (e) {
          // Non-critical — continue
        }
      });

      this._stream.on('error', (err) => {
        // Code 11 = stream expired (5 min limit) → restart silently
        if (err.code === 11 || err.message?.includes('exceeded maximum allowed stream duration')) {
          logger.info('[STT] Stream limit reached — restarting automatically');
          this._errorCount = 0; // reset on expected expiry
        } else {
          this._errorCount++;
          logger.warn(`[STT] Stream error #${this._errorCount} (code ${err.code}): ${err.message}`);
          // Circuit breaker — if same error fires 5 times in a row, it's a permanent failure
          // (auth error, quota, etc.) — stop retrying to prevent log spam
          if (this._errorCount >= 5) {
            logger.warn('[STT] Circuit breaker triggered — disabling STT for this call after 5 consecutive errors');
            this._destroyed = true;
            this._stream = null;
            return;
          }
        }
        this._stream = null;
        if (!this._destroyed) {
          setTimeout(() => this.start(), 100); // restart after brief pause
        }
      });

      this._stream.on('end', () => {
        this._stream = null;
        // If not intentionally destroyed, restart
        if (!this._destroyed) {
          setTimeout(() => this.start(), 100);
        }
      });

      // Drain any chunks that arrived before stream was ready
      if (this._pendingChunks.length > 0) {
        const chunks = this._pendingChunks.splice(0);
        for (const buf of chunks) {
          this._writeToStream(buf);
        }
      }

      // Schedule auto-restart before 5-minute limit
      if (this._restartTimer) clearTimeout(this._restartTimer);
      this._restartTimer = setTimeout(() => {
        if (!this._destroyed) {
          logger.info('[STT] Proactive restart (4 min 50 sec)');
          this._endStream();
          this.start();
        }
      }, RESTART_INTERVAL_MS);

    } catch (e) {
      logger.warn('[STT] streamingRecognize failed — STT disabled for this call:', e.message);
      this._stream = null;
    }
  }

  // ── Write a PCM16 audio chunk to the stream ──────────────────────────────────
  write(pcmBuffer) {
    if (this._destroyed || !pcmBuffer || pcmBuffer.length === 0) return;
    if (!this._stream) {
      // Buffer until stream is ready (e.g., first chunk before start() completes)
      this._pendingChunks.push(pcmBuffer);
      return;
    }
    this._writeToStream(pcmBuffer);
  }

  _writeToStream(pcmBuffer) {
    try {
      if (this._stream && !this._stream.destroyed) {
        this._stream.write({ audioContent: pcmBuffer });
      }
    } catch (e) {
      // Stream may have closed — next write will buffer and restart
    }
  }

  // ── End current stream without destroying the service ───────────────────────
  _endStream() {
    if (this._stream) {
      try { this._stream.end(); } catch (_) {}
      this._stream = null;
    }
  }

  // ── Permanently destroy — call on call end ───────────────────────────────────
  destroy() {
    this._destroyed = true;
    if (this._restartTimer) { clearTimeout(this._restartTimer); this._restartTimer = null; }
    this._endStream();
    this._pendingChunks = [];
    this.removeAllListeners();
  }
}

module.exports = { SttService };
