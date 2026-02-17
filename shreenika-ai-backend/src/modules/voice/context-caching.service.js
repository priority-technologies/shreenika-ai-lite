/**
 * Context Caching Service
 *
 * Leverages Gemini's Context Caching to pre-load knowledge documents.
 * Instead of injecting documents into every systemInstruction,
 * we upload them once to Google's cache and get a cache_id.
 *
 * Benefits:
 * - No character/token overhead in systemInstruction
 * - Documents pre-processed and cached by Google
 * - 90% cost savings on input tokens vs re-uploading
 * - Faster response time (cached tokens pre-computed)
 *
 * Reference: https://ai.google.dev/gemini-api/docs/caching
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Context Caching Service
 * Manages cached content for Gemini Live sessions
 */
export class ContextCachingService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = new GoogleGenerativeAI(apiKey);
    this.cacheMap = new Map(); // agentId → cache_id
  }

  /**
   * Create or retrieve cached content for knowledge documents
   * @param {string} agentId - Agent ID (key for cache lookup)
   * @param {Array} knowledgeDocs - Array of {title, content} documents
   * @returns {Promise<string>} - cache_id for use in WebSocket setup
   */
  async getOrCreateCache(agentId, knowledgeDocs) {
    // Check if cache already exists for this agent
    if (this.cacheMap.has(agentId)) {
      const cachedId = this.cacheMap.get(agentId);
      console.log(`✅ Using existing cache for agent ${agentId}: ${cachedId}`);
      return cachedId;
    }

    // Build knowledge base text
    const knowledgeText = this._buildKnowledgeText(knowledgeDocs);
    if (!knowledgeText || knowledgeText.length === 0) {
      console.log(`ℹ️ No knowledge documents to cache for agent ${agentId}`);
      return null;
    }

    try {
      console.log(`📚 Creating cache for agent ${agentId}: ${knowledgeText.length} chars`);

      // Use REST API to create cached content (since WebSocket doesn't support caching)
      const cacheId = await this._createCachedContent(knowledgeText);

      // Store in map for future use
      this.cacheMap.set(agentId, cacheId);
      console.log(`✅ Cache created: ${cacheId}`);

      return cacheId;
    } catch (err) {
      console.error(`❌ Cache creation failed:`, err.message);
      return null;
    }
  }

  /**
   * Create cached content via REST API
   * @private
   * @param {string} knowledgeText - Knowledge base text to cache
   * @returns {Promise<string>} - cache_id
   */
  async _createCachedContent(knowledgeText) {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/cachedContents';

    const payload = {
      model: 'models/gemini-2.5-flash',
      displayName: `knowledge_cache_${Date.now()}`,
      usage_metadata: {
        cache_creation_input_token_count: Math.ceil(knowledgeText.length / 4), // Rough estimate
      },
      system_instruction: {
        parts: [{
          text: `You have access to the following knowledge base. Use it to answer questions accurately. Only use information provided in the knowledge base.`
        }]
      },
      contents: [{
        role: 'user',
        parts: [{
          text: `Knowledge Base:\n\n${knowledgeText}`
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
      throw new Error(`Cache API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.name; // Format: projects/.../cachedContents/12345
  }

  /**
   * Build knowledge base text from documents
   * @private
   * @param {Array} knowledgeDocs - Array of {title, content, ...} documents
   * @returns {string}
   */
  _buildKnowledgeText(knowledgeDocs) {
    if (!knowledgeDocs || knowledgeDocs.length === 0) {
      return '';
    }

    const maxTotalChars = 200000; // Cache size limit (conservative estimate)
    let totalChars = 0;
    const parts = [];

    parts.push('=== KNOWLEDGE BASE ===\n');

    for (const doc of knowledgeDocs) {
      const docText = doc.rawText || doc.content || '';
      if (!docText) continue;

      // Truncate individual documents if needed
      const remaining = maxTotalChars - totalChars;
      if (remaining <= 0) break;

      const truncated = docText.substring(0, Math.min(remaining, 50000));
      parts.push(`\n[Document: ${doc.title || 'Untitled'}]\n`);
      parts.push(truncated);
      totalChars += truncated.length;
    }

    parts.push('\n=== END KNOWLEDGE BASE ===');
    return parts.join('');
  }

  /**
   * Get cache_id for use in Gemini Live WebSocket setup message
   * @param {string} agentId
   * @returns {string|null}
   */
  getCacheId(agentId) {
    return this.cacheMap.get(agentId) || null;
  }

  /**
   * Clear cache for an agent (when documents are updated)
   * @param {string} agentId
   */
  clearCache(agentId) {
    this.cacheMap.delete(agentId);
    console.log(`🗑️ Cache cleared for agent ${agentId}`);
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      cachedAgents: this.cacheMap.size,
      caches: Array.from(this.cacheMap.entries()).map(([agentId, cacheId]) => ({
        agentId,
        cacheId
      }))
    };
  }
}

export default ContextCachingService;
