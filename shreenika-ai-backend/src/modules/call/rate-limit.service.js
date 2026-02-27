/**
 * Rate Limiting Service
 * Gap 12: Prevent DOS attacks and abuse by limiting call initiation rate
 *
 * Tracks call initiation attempts per user and enforces rate limits
 */

class RateLimitService {
  constructor(maxCallsPerMinute = 10, windowMs = 60000) {
    this.maxCallsPerMinute = maxCallsPerMinute; // Max calls per time window
    this.windowMs = windowMs; // Time window in milliseconds (default 1 minute)
    this.callTracker = new Map(); // Track calls by userId
  }

  /**
   * Check if user has exceeded rate limit
   * @param {string} userId - User ID
   * @returns {object} - { allowed: boolean, remaining: number, resetTime: timestamp }
   */
  checkRateLimit(userId) {
    const now = Date.now();
    const key = userId.toString();

    // Initialize or clean up old entries
    if (!this.callTracker.has(key)) {
      this.callTracker.set(key, {
        calls: [],
        resetTime: now + this.windowMs
      });
    }

    const userRecord = this.callTracker.get(key);

    // Clean up calls outside the time window
    userRecord.calls = userRecord.calls.filter(timestamp => now - timestamp < this.windowMs);

    // Check if limit exceeded
    const remaining = Math.max(0, this.maxCallsPerMinute - userRecord.calls.length);
    const allowed = userRecord.calls.length < this.maxCallsPerMinute;

    // Reset timer if window expired
    if (now >= userRecord.resetTime) {
      userRecord.calls = [];
      userRecord.resetTime = now + this.windowMs;
    }

    return {
      allowed,
      remaining,
      resetTime: userRecord.resetTime,
      attempted: userRecord.calls.length,
      limit: this.maxCallsPerMinute
    };
  }

  /**
   * Record a call attempt
   * @param {string} userId - User ID
   */
  recordCall(userId) {
    const key = userId.toString();

    if (!this.callTracker.has(key)) {
      this.callTracker.set(key, {
        calls: [],
        resetTime: Date.now() + this.windowMs
      });
    }

    this.callTracker.get(key).calls.push(Date.now());
  }

  /**
   * Get current status for a user
   * @param {string} userId - User ID
   * @returns {object} - Rate limit status
   */
  getStatus(userId) {
    const key = userId.toString();
    if (!this.callTracker.has(key)) {
      return {
        userId,
        attempted: 0,
        limit: this.maxCallsPerMinute,
        remaining: this.maxCallsPerMinute,
        windowMs: this.windowMs
      };
    }

    const userRecord = this.callTracker.get(key);
    const now = Date.now();
    const validCalls = userRecord.calls.filter(t => now - t < this.windowMs);

    return {
      userId,
      attempted: validCalls.length,
      limit: this.maxCallsPerMinute,
      remaining: Math.max(0, this.maxCallsPerMinute - validCalls.length),
      windowMs: this.windowMs,
      resetIn: Math.max(0, userRecord.resetTime - now)
    };
  }

  /**
   * Reset rate limit for a user (admin/debug only)
   * @param {string} userId - User ID
   */
  resetUser(userId) {
    const key = userId.toString();
    this.callTracker.delete(key);
    console.log(`✅ Rate limit reset for user: ${userId}`);
  }

  /**
   * Clear all rate limit data
   */
  clearAll() {
    this.callTracker.clear();
    console.log(`✅ All rate limits cleared`);
  }
}

// Create singleton instance
export const rateLimitService = new RateLimitService(
  parseInt(process.env.RATE_LIMIT_CALLS_PER_MINUTE || '10'),
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000')
);

export default RateLimitService;
