/**
 * Injection Queue Service (Milestone 2)
 *
 * Coordinates all Gemini injections (psychology, personality, context) into a single
 * batched message with priority-based de-duplication.
 *
 * Priority Order (highest to lowest):
 * 1. SYSTEM — Core system instructions (cannot be overridden)
 * 2. PERSONALITY — Agent personality adjustments
 * 3. CONTEXT — Conversation context and prior turns
 * 4. PREDICTION — Predictive/optional instructions
 *
 * Purpose:
 * - Prevents conflicts from overlapping injections
 * - Ensures single coherent Gemini message per RESPONDING state
 * - Implements de-duplication by type (last high-priority wins)
 * - Formats all content as client_content for mid-session injection
 */

export class InjectionQueueService {
  constructor() {
    // Priority levels for ordering
    this.priorities = {
      SYSTEM: 0,        // Highest priority
      PERSONALITY: 1,
      CONTEXT: 2,
      PREDICTION: 3     // Lowest priority
    };

    // Queue: Array of { type, priority, instruction, metadata, timestamp }
    this.queue = [];

    console.log('🔌 Injection Queue Service initialized');
  }

  /**
   * Add an injection to the queue
   *
   * @param {Object} injection - { type, instruction, metadata }
   * @param {string} injection.type - Type: SYSTEM, PERSONALITY, CONTEXT, PREDICTION
   * @param {string} injection.instruction - The instruction text
   * @param {Object} injection.metadata - Additional context about the injection
   * @returns {void}
   */
  enqueue(injection) {
    if (!injection || !injection.type || !injection.instruction) {
      console.warn('[QUEUE] Invalid injection (missing type or instruction), skipping');
      return;
    }

    const priority = this.priorities[injection.type];
    if (priority === undefined) {
      console.warn(`[QUEUE] Unknown injection type "${injection.type}", treating as PREDICTION`);
      injection.type = 'PREDICTION';
      priority = this.priorities.PREDICTION;
    }

    const queueItem = {
      type: injection.type,
      priority: priority,
      instruction: injection.instruction,
      metadata: injection.metadata || {},
      timestamp: Date.now(),
      id: `${injection.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.queue.push(queueItem);

    console.log(`[QUEUE] Enqueued: ${injection.type} instruction (queue size: ${this.queue.length})`);
  }

  /**
   * De-duplicate the queue by keeping only highest-priority injection per type
   *
   * Strategy: For each type, keep ONLY the last (most recent) injection
   * This gives later injections priority over earlier ones of the same type
   *
   * @returns {Array} - De-duplicated queue items
   */
  deduplicateByType() {
    const seen = {}; // Track last occurrence of each type

    // Find the index of the LAST occurrence of each type
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      if (!seen[item.type]) {
        seen[item.type] = i; // Remember this index
      }
    }

    // Keep only items that are the last of their type
    const deduplicated = this.queue.filter((item, idx) => seen[item.type] === idx);

    if (deduplicated.length < this.queue.length) {
      console.log(`[QUEUE] De-duplicated: ${this.queue.length} → ${deduplicated.length} items`);
      this.queue = deduplicated;
    }

    return deduplicated;
  }

  /**
   * Sort queue by priority (SYSTEM first, PREDICTION last)
   * Within same priority, maintain insertion order (stable sort)
   *
   * @returns {Array} - Priority-sorted queue items
   */
  sortByPriority() {
    // Stable sort: JavaScript's sort is stable, sort by priority only
    this.queue.sort((a, b) => a.priority - b.priority);
    return this.queue;
  }

  /**
   * Flush the queue: de-duplicate, sort, and return combined instruction text
   *
   * @returns {Object} - { combinedInstruction, injectionCount, details }
   */
  flush() {
    if (this.queue.length === 0) {
      console.log('[QUEUE] Queue is empty, nothing to flush');
      return { combinedInstruction: '', injectionCount: 0, details: [] };
    }

    console.log(`[QUEUE] Flushing ${this.queue.length} injections...`);

    // Step 1: De-duplicate by type
    this.deduplicateByType();

    // Step 2: Sort by priority
    this.sortByPriority();

    // Step 3: Build combined instruction with clear separation
    const instructionParts = [];
    const details = [];

    for (const item of this.queue) {
      // Add instruction with section header
      const sectionHeader = `[${item.type}]`;
      instructionParts.push(`${sectionHeader} ${item.instruction}`);

      // Track for logging
      details.push({
        type: item.type,
        priority: item.priority,
        instructionLength: item.instruction.length,
        metadata: item.metadata
      });
    }

    const combinedInstruction = instructionParts.join('\n\n');

    console.log(`[QUEUE] Flushed ${this.queue.length} injections:`,
      details.map(d => `${d.type}(${d.instructionLength}c)`).join(' + ')
    );

    return {
      combinedInstruction,
      injectionCount: this.queue.length,
      details
    };
  }

  /**
   * Clear the queue
   *
   * @returns {void}
   */
  clear() {
    const count = this.queue.length;
    this.queue = [];
    if (count > 0) {
      console.log(`[QUEUE] Cleared ${count} injections`);
    }
  }

  /**
   * Get current queue size
   *
   * @returns {number}
   */
  size() {
    return this.queue.length;
  }

  /**
   * Get current queue contents (for debugging)
   *
   * @returns {Array}
   */
  getQueue() {
    return this.queue.map(item => ({
      type: item.type,
      priority: item.priority,
      preview: item.instruction.substring(0, 50) + (item.instruction.length > 50 ? '...' : '')
    }));
  }

  /**
   * Check if queue contains a specific type
   *
   * @param {string} type
   * @returns {boolean}
   */
  hasType(type) {
    return this.queue.some(item => item.type === type);
  }

  /**
   * Get first injection of a specific type
   *
   * @param {string} type
   * @returns {Object|null}
   */
  getByType(type) {
    return this.queue.find(item => item.type === type) || null;
  }
}

export default InjectionQueueService;
