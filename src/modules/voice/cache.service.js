/**
 * Cache Service — Personal (50 hits) + Global (500 hits)
 * Uses hash-based fingerprinting
 */
const crypto = require('crypto');

class CacheService {
  constructor() {
    this.personalCache = new Map();  // Per-agent cache
    this.globalCache = new Map();    // Shared across agents
    this.hitCounts = new Map();
    this.PERSONAL_THRESHOLD = 50;
    this.GLOBAL_THRESHOLD = 500;
    this.stats = { personalHits: 0, globalHits: 0, misses: 0 };
  }

  _hash(text) {
    return crypto.createHash('md5').update(text.toLowerCase().trim()).digest('hex').substring(0, 16);
  }

  get(agentId, input) {
    const key = this._hash(input);
    const agentKey = `${agentId}:${key}`;

    // Check personal cache first
    if (this.personalCache.has(agentKey)) {
      this.stats.personalHits++;
      return { response: this.personalCache.get(agentKey), source: 'personal' };
    }

    // Check global cache
    if (this.globalCache.has(key)) {
      this.stats.globalHits++;
      return { response: this.globalCache.get(key), source: 'global' };
    }

    this.stats.misses++;
    return null;
  }

  set(agentId, input, response) {
    const key = this._hash(input);
    const agentKey = `${agentId}:${key}`;

    // Track hits
    const count = (this.hitCounts.get(key) || 0) + 1;
    this.hitCounts.set(key, count);

    // Add to personal cache
    this.personalCache.set(agentKey, response);

    // Promote to global cache if threshold reached
    if (count >= this.PERSONAL_THRESHOLD) {
      this.globalCache.set(key, response);
    }
  }

  getStats() {
    return {
      ...this.stats,
      personalCacheSize: this.personalCache.size,
      globalCacheSize: this.globalCache.size,
      totalRequests: this.stats.personalHits + this.stats.globalHits + this.stats.misses,
      hitRate: this.stats.misses > 0
        ? (((this.stats.personalHits + this.stats.globalHits) / (this.stats.personalHits + this.stats.globalHits + this.stats.misses)) * 100).toFixed(1) + '%'
        : '0%'
    };
  }
}

// Singleton instance
const cacheService = new CacheService();
module.exports = cacheService;
