'use strict';
/**
 * context-cache.service.js
 *
 * Vertex AI Context Caching — Layer 2 Intelligence
 *
 * Purpose:
 *   Instead of sending 35,000 chars of system instruction inline on every call,
 *   upload it ONCE to Vertex AI Cache API → get back a cachedContentName.
 *   Every subsequent call references the ID only.
 *   Google charges ~75% less for cached input tokens.
 *
 * Strategy:
 *   1. Build system instruction (already done by buildMasterSystemInstruction)
 *   2. SHA256 hash the instruction — if hash matches stored hash AND not expired → use cached ID
 *   3. If hash mismatch OR expired → create new cache entry, store name + hash + expiry in agent doc
 *   4. In Gemini setup payload — use cachedContent field instead of systemInstruction field
 *
 * Fallback:
 *   If Vertex AI rejects caching (unsupported model, quota, etc.) → returns null
 *   Caller falls back to inline systemInstruction — zero breakage, zero call drop
 *
 * Cache TTL: 23 hours (Vertex AI minimum is 1 hour, maximum is 30 days)
 */

const crypto  = require('crypto');
const fetch   = require('node-fetch');
const { GoogleAuth } = require('google-auth-library');

const logger  = (function () {
  try { return require('./logger'); } catch (_) { return console; }
})();

const PROJECT_ID  = process.env.GOOGLE_CLOUD_PROJECT_ID || 'gen-lang-client-0348687456';
const LOCATION    = 'us-central1';
const CACHE_TTL   = '82800s';  // 23 hours in seconds
const CACHE_API   = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/cachedContents`;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

// ── Hash helper ────────────────────────────────────────────────────────────────
function hashInstruction(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

// ── Create a new cache entry on Vertex AI ─────────────────────────────────────
async function createCacheEntry(systemInstruction, modelName) {
  const token = await auth.getAccessToken();

  const body = {
    model: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${modelName}`,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    ttl: CACHE_TTL,
  };

  // Hard 3-second timeout — if Vertex AI Cache API doesn't respond in time,
  // abort immediately so Gemini connection is not blocked.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 3000);

  let res;
  try {
    res = await fetch(CACHE_API, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI Cache API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  // data.name = "projects/.../locations/.../cachedContents/abc123"
  return data.name;
}

// ── Main export: getOrCreate ──────────────────────────────────────────────────
// Returns cachedContentName (string) or null (fallback to inline)
async function getOrCreate(agentDoc, systemInstruction, modelName) {
  try {
    const AgentModel = require('../modules/voice/agent.mongo.model');
    const agentId    = agentDoc.agentId || agentDoc._id?.toString();
    if (!agentId) return null;

    const instructionHash = hashInstruction(systemInstruction);
    const now             = new Date();

    // ── Check if existing cache entry is still valid ──────────────────────────
    const stored = await AgentModel.findOne({ agentId })
      .select('cachedContentName cachedContentHash cachedContentExpiry')
      .lean();

    if (
      stored?.cachedContentName &&
      stored?.cachedContentHash === instructionHash &&
      stored?.cachedContentExpiry && new Date(stored.cachedContentExpiry) > now
    ) {
      logger.info('[CTX-CACHE] HIT — reusing cache for agentId:', agentId,
        '| expires:', new Date(stored.cachedContentExpiry).toISOString());
      return stored.cachedContentName;
    }

    // ── Create new cache entry ────────────────────────────────────────────────
    logger.info('[CTX-CACHE] MISS — creating new cache entry for agentId:', agentId,
      '| reason:', !stored?.cachedContentName ? 'first time' :
      stored?.cachedContentHash !== instructionHash ? 'instruction changed' : 'expired');

    const cachedContentName = await createCacheEntry(systemInstruction, modelName);

    // Store name + hash + expiry in agent document (non-blocking)
    const expiry = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23 hours from now
    AgentModel.updateOne(
      { agentId },
      {
        cachedContentName,
        cachedContentHash:   instructionHash,
        cachedContentExpiry: expiry,
      }
    ).catch(e => logger.warn('[CTX-CACHE] Failed to persist cache name:', e.message));

    logger.info('[CTX-CACHE] Created:', cachedContentName, '| expires:', expiry.toISOString());
    return cachedContentName;

  } catch (err) {
    // Non-fatal — log and return null so caller falls back to inline instruction
    logger.warn('[CTX-CACHE] getOrCreate failed (falling back to inline):', err.message);
    return null;
  }
}

module.exports = { getOrCreate, hashInstruction };
