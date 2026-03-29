'use strict';
/**
 * AudioCacheService — Personal + Global Audio Cache
 *
 * Strategy:
 *   Phase 1 (Month 1, first 20% calls): Pure Gemini — learning mode
 *   Phase 2 (Month 1, next 50% calls):  Cache growing — partial hits
 *   Phase 3 (Month 1, last 30% calls):  Cache experiments
 *   Month 2+: Majority from cache → revenue positive
 *
 * Architecture:
 *   - MongoDB: stores fingerprint metadata (text, hitCount, agentId, userId, gcsPath)
 *   - GCS: stores actual audio bytes (PCM 16kHz mono)
 *   - Fingerprint: SHA256 hash of normalized caller question text
 *
 * Deduction rates (approved):
 *   - Gemini minute: 1.0 minute from balance
 *   - Cache minute:  0.04 minutes from balance (INR 0.25 / INR 6.25 = 4%)
 *
 * Cache threshold: 20 hits before a phrase is served from cache
 */

const crypto   = require('crypto');
const mongoose = require('mongoose');

// ── GCS client (lazy-init) ────────────────────────────────────────────────────
let gcsBucket = null;

function getGCSBucket() {
  if (gcsBucket) return gcsBucket;
  try {
    const { Storage } = require('@google-cloud/storage');
    const gcsClient = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'gen-lang-client-0348687456' });
    gcsBucket = gcsClient.bucket(process.env.AUDIO_CACHE_BUCKET || 'shreenika-ai-audio-cache');
    return gcsBucket;
  } catch (e) {
    console.warn('[AUDIO-CACHE] GCS not available:', e.message);
    return null;
  }
}

// ── MongoDB Model ─────────────────────────────────────────────────────────────
const audioCacheSchema = new mongoose.Schema({
  fingerprint:    { type: String, required: true, index: true },
  normalizedText: { type: String, required: true },
  language:       { type: String, default: 'hi-IN' },
  hitCount:       { type: Number, default: 1 },
  servedCount:    { type: Number, default: 0 },
  gcsPath:        { type: String, default: null },
  agentId:        { type: String, index: true },
  userId:         { type: String, index: true },
  isGlobal:       { type: Boolean, default: false },
  audioLengthMs:  { type: Number, default: 0 },
  createdAt:      { type: Date, default: Date.now },
  lastSeenAt:     { type: Date, default: Date.now },
}, { collection: 'audiocache' });

audioCacheSchema.index({ userId: 1, agentId: 1, fingerprint: 1 });
audioCacheSchema.index({ isGlobal: 1, fingerprint: 1 });

const AudioCache = mongoose.models.AudioCache || mongoose.model('AudioCache', audioCacheSchema);

// ── Constants ─────────────────────────────────────────────────────────────────
const CACHE_THRESHOLD  = 20;   // serve from cache after 20+ hits
const GLOBAL_THRESHOLD = 50;   // promote to global after 50+ hits across 3+ users
const CACHE_MIN_CHARS  = 8;
const CACHE_MAX_CHARS  = 300;

// ── Text normalization ────────────────────────────────────────────────────────
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
    .replace(/\b(um+|uh+|hmm+|haan|haa|thik hai|achha|okay|ok|ji)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateFingerprint(normalizedText) {
  return crypto.createHash('sha256').update(normalizedText).digest('hex').substring(0, 32);
}

// ── Core Cache Service ────────────────────────────────────────────────────────
class AudioCacheService {

  /**
   * Record a caller phrase hit. Called on every transcribed caller turn.
   * Returns { fingerprint, hitCount, shouldCache }
   */
  static async recordHit(callerText, { agentId, userId, language = 'hi-IN' }) {
    try {
      const normalized = normalizeText(callerText);
      if (!normalized || normalized.length < CACHE_MIN_CHARS || normalized.length > CACHE_MAX_CHARS) {
        return { fingerprint: null, hitCount: 0, shouldCache: false };
      }

      const fingerprint = generateFingerprint(normalized);

      const doc = await AudioCache.findOneAndUpdate(
        { fingerprint, userId, agentId },
        {
          $inc:        { hitCount: 1 },
          $set:        { lastSeenAt: new Date(), language, normalizedText: normalized },
          $setOnInsert:{ fingerprint, userId, agentId, isGlobal: false, createdAt: new Date() },
        },
        { upsert: true, new: true }
      );

      const shouldCache = doc.hitCount >= CACHE_THRESHOLD && !doc.gcsPath;
      console.log(`[AUDIO-CACHE] Hit: "${normalized.substring(0, 40)}" count=${doc.hitCount} shouldCache=${shouldCache}`);

      return { fingerprint, hitCount: doc.hitCount, shouldCache, doc };
    } catch (e) {
      console.error('[AUDIO-CACHE] recordHit error:', e.message);
      return { fingerprint: null, hitCount: 0, shouldCache: false };
    }
  }

  /**
   * Save Gemini audio response bytes to GCS.
   * Called when hitCount >= CACHE_THRESHOLD and gcsPath is still null.
   * audioBuffer: raw PCM Buffer (16kHz mono)
   */
  static async saveAudioToCache(fingerprint, audioBuffer, { userId, agentId, audioLengthMs = 0 }) {
    try {
      const bucket = getGCSBucket();
      if (!bucket || !audioBuffer || audioBuffer.length === 0) return false;

      const gcsPath = `personal/${userId}/${agentId}/${fingerprint}.pcm`;
      const file    = bucket.file(gcsPath);

      await file.save(audioBuffer, {
        metadata:  { contentType: 'audio/pcm', cacheControl: 'public, max-age=86400' },
        resumable: false,
      });

      await AudioCache.updateOne(
        { fingerprint, userId, agentId },
        { $set: { gcsPath, audioLengthMs } }
      );

      console.log(`[AUDIO-CACHE] Saved to GCS: ${gcsPath} (${audioBuffer.length} bytes, ${audioLengthMs}ms)`);

      // Check global promotion: 3+ users with 50+ hits on same phrase
      const globalCount = await AudioCache.countDocuments({ fingerprint, hitCount: { $gte: GLOBAL_THRESHOLD } });
      if (globalCount >= 3) {
        await AudioCacheService.promoteToGlobal(fingerprint, gcsPath);
      }

      return true;
    } catch (e) {
      console.error('[AUDIO-CACHE] saveAudioToCache error:', e.message);
      return false;
    }
  }

  /**
   * Look up cached audio for a caller phrase.
   * Returns { hit: true, audioBuffer, audioLengthMs, source } or { hit: false }
   */
  static async lookup(callerText, { agentId, userId }) {
    try {
      const normalized = normalizeText(callerText);
      if (!normalized || normalized.length < CACHE_MIN_CHARS) return { hit: false };

      const fingerprint = generateFingerprint(normalized);

      // 1. Personal cache first
      const personal = await AudioCache.findOne({
        fingerprint, userId, agentId, gcsPath: { $ne: null }
      }).lean();

      if (personal?.gcsPath) {
        const audioBuffer = await AudioCacheService.downloadFromGCS(personal.gcsPath);
        if (audioBuffer) {
          await AudioCache.updateOne({ _id: personal._id }, { $inc: { servedCount: 1 } });
          console.log(`[AUDIO-CACHE] ✅ Personal HIT: "${normalized.substring(0, 40)}" served=${personal.servedCount + 1}`);
          return { hit: true, audioBuffer, audioLengthMs: personal.audioLengthMs, source: 'personal' };
        }
      }

      // 2. Global cache
      const global = await AudioCache.findOne({
        fingerprint, isGlobal: true, gcsPath: { $ne: null }
      }).lean();

      if (global?.gcsPath) {
        const audioBuffer = await AudioCacheService.downloadFromGCS(global.gcsPath);
        if (audioBuffer) {
          await AudioCache.updateOne({ _id: global._id }, { $inc: { servedCount: 1 } });
          console.log(`[AUDIO-CACHE] ✅ Global HIT: "${normalized.substring(0, 40)}" served=${global.servedCount + 1}`);
          return { hit: true, audioBuffer, audioLengthMs: global.audioLengthMs, source: 'global' };
        }
      }

      return { hit: false };
    } catch (e) {
      console.error('[AUDIO-CACHE] lookup error:', e.message);
      return { hit: false };
    }
  }

  /**
   * Download audio from GCS. Returns Buffer or null.
   */
  static async downloadFromGCS(gcsPath) {
    try {
      const bucket = getGCSBucket();
      if (!bucket) return null;
      const [contents] = await bucket.file(gcsPath).download();
      return contents;
    } catch (e) {
      console.error('[AUDIO-CACHE] GCS download error:', e.message);
      return null;
    }
  }

  /**
   * Promote a personal cache phrase to global cache.
   */
  static async promoteToGlobal(fingerprint, gcsPath) {
    try {
      const bucket = getGCSBucket();
      if (!bucket) return;

      const globalPath = `global/${fingerprint}.pcm`;
      await bucket.file(gcsPath).copy(bucket.file(globalPath));

      await AudioCache.findOneAndUpdate(
        { fingerprint, isGlobal: true },
        {
          $set:        { gcsPath: globalPath, isGlobal: true, lastSeenAt: new Date() },
          $setOnInsert:{ fingerprint, normalizedText: '', createdAt: new Date() },
        },
        { upsert: true }
      );

      console.log(`[AUDIO-CACHE] 🌍 Promoted to GLOBAL cache: ${fingerprint}`);
    } catch (e) {
      console.error('[AUDIO-CACHE] promoteToGlobal error:', e.message);
    }
  }

  /**
   * Get cache stats for a user/agent (used in dashboard).
   */
  static async getStats(userId, agentId) {
    try {
      const [totalPhrases, cachedPhrases, servedAgg] = await Promise.all([
        AudioCache.countDocuments({ userId, agentId }),
        AudioCache.countDocuments({ userId, agentId, gcsPath: { $ne: null } }),
        AudioCache.aggregate([
          { $match: { userId, agentId } },
          { $group: { _id: null, total: { $sum: '$servedCount' } } },
        ]),
      ]);

      return {
        totalPhrases,
        cachedPhrases,
        totalServed:  servedAgg[0]?.total || 0,
        cacheHitRate: totalPhrases > 0 ? Math.round((cachedPhrases / totalPhrases) * 100) : 0,
      };
    } catch (e) {
      return { totalPhrases: 0, cachedPhrases: 0, totalServed: 0, cacheHitRate: 0 };
    }
  }
}

module.exports = { AudioCacheService, AudioCache, normalizeText, generateFingerprint };
