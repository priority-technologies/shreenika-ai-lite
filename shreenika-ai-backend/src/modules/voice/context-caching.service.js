/**
 * Context Caching Service - 90% COST REDUCTION STRATEGY
 *
 * Leverage Gemini's Explicit Context Caching to cache system instruction + knowledge docs.
 * Instead of sending them with every call ($1.00/1M tokens), we cache once and reuse ($0.10/1M tokens).
 *
 * Architecture:
 * 1. Cache Creation (REST API, per agent, once per hour)
 *    - Upload: Persona + Product Knowledge + Hinglish Vocabulary (~131K chars = 32K+ tokens)
 *    - Get back: cache_id (e.g., projects/.../cachedContents/12345)
 * 2. Cache Reuse (WebSocket, every call)
 *    - Send only cache_id in BidiGenerateContentSetup
 *    - Omit systemInstruction (it's in the cache)
 *    - 90% savings on input tokens
 * 3. TTL Keep-Alive (PATCH request, after each call)
 *    - Reset TTL to 1 hour
 *    - Keeps cache warm 24/7 for high-volume campaigns
 *
 * Cost Impact:
 * - 1st call: $1.00/min (initial cache creation + storage)
 * - 2-5+ calls/hour: $0.10/min (cached) — 90% OFF
 * - Break-even: 4+ calls per hour
 * - 20-call campaign: ₹167/hr → ₹16.70/hr
 *
 * Reference: https://ai.google.dev/gemini-api/docs/caching
 */

/**
 * MASTER KNOWLEDGE DOCUMENT LOADER
 * 35,000+ tokens of Shreenika knowledge for 90% cost reduction
 *
 * This document includes:
 * 1. Shreenika Core Brain (identity + behavioral rules)
 * 2. Expanded Hinglish Vocabulary (500+ phrases)
 * 3. Business FAQs (template for product-specific content)
 * 4. Contextual Padding (Indian geography, business etiquette, cultural knowledge)
 *
 * Token count: 35,000-40,000 tokens (exceeds 32,768 minimum requirement)
 * Cost impact: 90% discount on input tokens after first cache creation
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let MASTER_KNOWLEDGE_DOCUMENT = null;

/**
 * Load Master Knowledge Document from file
 * File must exist at: shreenika-ai-backend/src/masters/shreenika_master_cache.txt
 */
function loadMasterKnowledgeDocument() {
  if (MASTER_KNOWLEDGE_DOCUMENT) {
    return MASTER_KNOWLEDGE_DOCUMENT; // Cache in memory
  }

  try {
    const mastFilePath = join(__dirname, '../../masters/shreenika_master_cache.txt');
    MASTER_KNOWLEDGE_DOCUMENT = readFileSync(mastFilePath, 'utf-8');

    const charCount = MASTER_KNOWLEDGE_DOCUMENT.length;
    const estimatedTokens = Math.ceil(charCount / 4);

    console.log(`✅ Master Knowledge Document loaded successfully`);
    console.log(`   📊 Character count: ${charCount.toLocaleString()}`);
    console.log(`   🎯 Estimated tokens: ${estimatedTokens.toLocaleString()} (${estimatedTokens >= 32768 ? '✅ EXCEEDS' : '⚠️  BELOW'} 32,768 minimum)`);

    return MASTER_KNOWLEDGE_DOCUMENT;
  } catch (error) {
    console.warn(`⚠️  Master Knowledge Document not found at shreenika-ai-backend/src/masters/shreenika_master_cache.txt`);
    console.warn(`   Using fallback Hinglish vocabulary. To enable 90% caching discount, provide the full Master Knowledge Document.`);
    console.warn(`   Error: ${error.message}`);
    return null;
  }
}

/**
 * Fallback HINGLISH VOCABULARY (Used only if Master Document not found)
 * ~3,000 characters / ~750 tokens (insufficient for caching discount)
 */
const FALLBACK_HINGLISH_VOCABULARY = `
=== HINGLISH BUSINESS VOCABULARY & PHRASES ===
[Fallback content - see Master Knowledge Document for full version]

Common Greetings & Affirmations:
- Acha ji / Bilkul sahi / Theek hai / Haan / Nahi / Maybe / Zaroor / No problem
- Kya bol rahe ho? / Samajh gaye? / Maloom hua? / Suno please / Suniye

Sales Objections & Handling:
- Bahut mehenga hai / Budget nahi hai / Funds available nahi hain
- Kab deliver karoge? / Kitne din lagenge? / Timeline kya hai?
- Quality kaisa hai? / Guarantee denge? / Warranty ka kya?

Numbers, Money & Time:
- Hazaar / Lakh / Crore / Rupaye / Rupee / Paisa / Thousands / Millions
- Aaj / Kal / Parson / Agle haftey / Agle mahine / Agle quarter

Customer Service Phrases:
- Aapka naam? / Aapki company? / Aapka department? / Contact number?
- Aapko kya chahiye? / Main kaise help kar sakta hoon?
- Solution available hai / Hum kar sakte hain / Arrangement ho sakta hai

Payment & Negotiation:
- Advance paisa chahiye / Payment kaise hogi? / Installments possible?
- Best price de dunga / Marginal profit lete hain

Follow-up & Commitment:
- Kal morning call karunga / Subah 10 baje call kar dunga
- SMS bhej dunga / Email kar dunga / WhatsApp message bhej dunga

Closing Statements:
- Deal ho gaya / Fixed ho gaya / Settled ho gaya
- Perfect! Shukriya / Dhanyavaad / Thank you

Professional Courtesies:
- Kripaya rukiye / Please hold / Just one moment
- Happy to help / Hum yahan hain aapki help ke liye

=== NOTE: For full Hinglish vocabulary + geographical intelligence + business etiquette ===
=== See: shreenika_master_cache.txt (35,000+ tokens) ===
`;

/**
 * Context Caching Service - Singleton pattern
 * Manages cached content for Gemini Live sessions across all calls in the process
 */
export class ContextCachingService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // Live model for caching (CRITICAL: must match the live session model)
    this.liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';
    // In-memory cache: agentId → { cacheId, createdAt, systemInstruction, docCount }
    this.cacheMap = new Map();
    console.log(`💾 Context Caching Service initialized`);
    console.log(`   Live Model: ${this.liveModel}`);
    console.log(`   Threshold: 32,768 tokens (~131K chars)`);
  }

  /**
   * Get or create cached content for system instruction + knowledge docs
   * CRITICAL: This is called once per agent per hour. Deduplication saves 90% of costs.
   *
   * @param {string} agentId - Agent ID (cache key)
   * @param {string} systemInstruction - Shreenika persona + role prompt
   * @param {Array} knowledgeDocs - Knowledge documents [{title, rawText}, ...]
   * @returns {Promise<string|null>} - cache_id or null if below threshold
   */
  async getOrCreateCache(agentId, systemInstruction, knowledgeDocs = []) {
    // Check if cache already exists for this agent (deduplication)
    if (this.cacheMap.has(agentId)) {
      const cached = this.cacheMap.get(agentId);
      console.log(`✅ Reusing cache for agent ${agentId}`);
      console.log(`   Cache ID: ${cached.cacheId}`);
      console.log(`   Created: ${new Date(cached.createdAt).toISOString()}`);
      console.log(`   Docs: ${cached.docCount}, Instruction chars: ${cached.instructionChars}`);
      return cached.cacheId;
    }

    try {
      // Build full cache content: system instruction + knowledge + Hinglish vocabulary
      const cacheContent = this._buildCacheContent(systemInstruction, knowledgeDocs);

      if (!cacheContent || cacheContent.length === 0) {
        console.log(`⚠️  No cache content for agent ${agentId}`);
        return null;
      }

      console.log(`📚 Creating cache for agent ${agentId}`);
      console.log(`   Content size: ${cacheContent.length} chars (~${Math.ceil(cacheContent.length / 4)} tokens)`);

      // Create cache via REST API
      const cacheId = await this._createCachedContent(cacheContent);

      if (!cacheId) {
        console.warn(`⚠️  Cache creation returned null for agent ${agentId}`);
        return null;
      }

      // Store in map for deduplication
      const metadata = {
        cacheId,
        createdAt: Date.now(),
        systemInstruction: systemInstruction ? systemInstruction.length : 0,
        docCount: knowledgeDocs ? knowledgeDocs.length : 0,
        instructionChars: systemInstruction ? systemInstruction.length : 0
      };
      this.cacheMap.set(agentId, metadata);

      console.log(`✅ Cache created and cached for agent ${agentId}`);
      console.log(`   Cache ID: ${cacheId}`);
      console.log(`   TTL: 1 hour (refresh via PATCH request after each call)`);

      return cacheId;

    } catch (err) {
      console.error(`❌ Cache creation failed for agent ${agentId}:`, err.message);
      return null;
    }
  }

  /**
   * Create cached content via Gemini REST API
   * @private
   * @param {string} cacheContent - Full content (system instruction + knowledge + vocab)
   * @returns {Promise<string>} - cache_id (e.g., projects/.../cachedContents/12345)
   */
  async _createCachedContent(cacheContent) {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/cachedContents';

    // Important: model MUST match the live session model
    const payload = {
      model: `models/${this.liveModel}`,
      displayName: `shreenika_cache_${Date.now()}`,
      ttl: '3600s', // 1 hour (will be refreshed via PATCH after each call)
      system_instruction: {
        parts: [{
          text: 'You are Shreenika, an AI sales agent. Use the knowledge base and vocabulary to provide personalized responses.'
        }]
      },
      contents: [{
        role: 'user',
        parts: [{
          text: cacheContent
        }]
      }]
    };

    const response = await fetch(`${endpoint}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      const errorMsg = error.error?.message || response.statusText;
      if (errorMsg.includes('minimum number of tokens')) {
        throw new Error(`Cache requires 32K+ tokens. Your content: ${Math.ceil(cacheContent.length / 4)} tokens. Add knowledge base or enable Hinglish padding.`);
      }
      throw new Error(`Cache API error: ${errorMsg}`);
    }

    const data = await response.json();
    return data.name; // Format: projects/.../cachedContents/12345
  }

  /**
   * Build cache content: system instruction + knowledge docs + Master Knowledge Document
   * @private
   */
  _buildCacheContent(systemInstruction, knowledgeDocs) {
    const parts = [];

    // 1. System Instruction (Shreenika persona)
    if (systemInstruction) {
      parts.push('=== SYSTEM INSTRUCTION ===\n');
      parts.push(systemInstruction);
      parts.push('\n\n');
    }

    // 2. Knowledge Base (Agent-specific documents)
    if (knowledgeDocs && knowledgeDocs.length > 0) {
      parts.push('=== AGENT KNOWLEDGE BASE ===\n');
      for (const doc of knowledgeDocs) {
        const text = doc.rawText || doc.content || '';
        if (text) {
          parts.push(`\n[Document: ${doc.title || 'Untitled'}]\n`);
          parts.push(text);
        }
      }
      parts.push('\n=== END AGENT KNOWLEDGE BASE ===\n\n');
    }

    // 3. Master Knowledge Document (35,000+ tokens)
    // Includes: Shreenika core brain + expanded Hinglish + business etiquette + geographical context
    const masterDoc = loadMasterKnowledgeDocument();
    if (masterDoc) {
      parts.push('=== SHREENIKA MASTER KNOWLEDGE DOCUMENT ===\n');
      parts.push(masterDoc);
      parts.push('\n=== END MASTER KNOWLEDGE DOCUMENT ===\n');
    } else {
      // Fallback if Master Document not found
      console.warn('⚠️  Master Knowledge Document not available, using fallback vocabulary');
      parts.push(FALLBACK_HINGLISH_VOCABULARY);
    }

    const finalContent = parts.join('');
    const charCount = finalContent.length;
    const tokenCount = Math.ceil(charCount / 4);

    console.log(`📊 Cache content built:`);
    console.log(`   ├─ Characters: ${charCount.toLocaleString()}`);
    console.log(`   ├─ Estimated tokens: ${tokenCount.toLocaleString()}`);
    console.log(`   └─ Status: ${tokenCount >= 32768 ? '✅ EXCEEDS 32,768 minimum' : '⚠️  BELOW 32,768 minimum'}`);

    return finalContent;
  }

  /**
   * Refresh cache TTL to keep it warm 24/7
   * Called after each call ends to reset expiration timer
   *
   * @param {string} cacheId - Cache ID from getOrCreateCache
   * @returns {Promise<boolean>} - Success status
   */
  async refreshTTL(cacheId) {
    if (!cacheId) {
      console.warn(`⚠️  refreshTTL: No cache ID provided`);
      return false;
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/${cacheId}`;

      const response = await fetch(`${endpoint}?key=${this.apiKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ttl: '3600s' // Reset to 1 hour from now
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || response.statusText);
      }

      console.log(`⏰ Cache TTL refreshed: ${cacheId.substring(cacheId.lastIndexOf('/') + 1)}`);
      return true;

    } catch (err) {
      console.warn(`⚠️  Cache TTL refresh failed (non-critical):`, err.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const stats = {
      totalCached: this.cacheMap.size,
      caches: []
    };

    for (const [agentId, metadata] of this.cacheMap.entries()) {
      stats.caches.push({
        agentId,
        cacheId: metadata.cacheId,
        createdMinutesAgo: Math.round((Date.now() - metadata.createdAt) / 60000),
        systemInstructionChars: metadata.instructionChars,
        knowledgeDocCount: metadata.docCount
      });
    }

    return stats;
  }

  /**
   * Clear cache for an agent (when knowledge is updated)
   */
  clearCache(agentId) {
    this.cacheMap.delete(agentId);
    console.log(`🗑️  Cache cleared for agent ${agentId}`);
  }
}

/**
 * MODULE-LEVEL SINGLETON EXPORT
 * ✅ CRITICAL FIX FOR BUG #2: Singleton ensures deduplication across ALL calls
 * Without this, a new instance was created per call, losing the cache Map.
 */
export const sharedCachingService = new ContextCachingService(process.env.GOOGLE_API_KEY);

export default ContextCachingService;
