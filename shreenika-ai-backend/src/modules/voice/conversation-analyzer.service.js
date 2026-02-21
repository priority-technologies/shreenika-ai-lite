/**
 * Conversation Analyzer
 *
 * Analyzes real-time conversation to determine:
 * - Current conversation stage (Awareness/Consideration/Decision)
 * - Client profile type
 * - What objections exist
 * - What's been discussed
 * - Effectiveness of prior approaches
 *
 * This feeds into the Principle Decision Engine to select appropriate psychology
 */

export class ConversationAnalyzer {
  constructor() {
    this.conversationHistory = [];
    this.objections = [];
    this.discussedTopics = new Set();
    this.principlesUsed = [];
  }

  /**
   * Analyze conversation history to determine current stage
   *
   * @param {Array} messages - Conversation messages
   * @returns {String} - Stage: 'AWARENESS' | 'CONSIDERATION' | 'DECISION'
   */
  determineConversationStage(messages) {
    if (!messages || messages.length === 0) {
      return 'AWARENESS';
    }

    const transcript = messages.map(m => m.text || '').join(' ').toLowerCase();

    // DECISION stage indicators
    const decisionKeywords = [
      'price', 'cost', 'payment', 'buy', 'purchase', 'contract',
      'down payment', 'emi', 'installment', 'when can', 'ready to',
      'let\'s proceed', 'finalise', 'confirm', 'how much'
    ];

    // CONSIDERATION stage indicators
    const considerationKeywords = [
      'compare', 'other options', 'similar', 'warranty', 'features',
      'guarantee', 'how does', 'what about', 'compared to', 'alternatives',
      'difference', 'benefits', 'why should'
    ];

    const decisionScore = decisionKeywords.filter(k => transcript.includes(k)).length;
    const considerationScore = considerationKeywords.filter(k => transcript.includes(k)).length;

    if (decisionScore > 2) return 'DECISION';
    if (considerationScore > 2) return 'CONSIDERATION';
    return 'AWARENESS';
  }

  /**
   * Determine client profile type from conversation
   *
   * @param {Array} messages - Conversation messages
   * @returns {String} - Profile: 'ANALYTICAL' | 'EMOTIONAL' | 'SKEPTICAL' | 'DECISION_MAKER'
   */
  determineClientProfile(messages) {
    if (!messages || messages.length === 0) {
      return 'ANALYTICAL'; // Default
    }

    const transcript = messages.map(m => m.text || '').join(' ').toLowerCase();

    // Analytical indicators
    const analyticalKeywords = ['data', 'proof', 'statistics', 'comparison', 'specifications', 'technical', 'details'];
    const analyticalScore = analyticalKeywords.filter(k => transcript.includes(k)).length;

    // Emotional indicators
    const emotionalKeywords = ['feel', 'comfortable', 'trust', 'worried', 'concerned', 'happy', 'satisfied', 'family'];
    const emotionalScore = emotionalKeywords.filter(k => transcript.includes(k)).length;

    // Skeptical indicators
    const skepticalKeywords = ['doubt', 'prove it', 'guarantee', 'risk', 'sure', 'certain', 'verify', 'scam'];
    const skepticalScore = skepticalKeywords.filter(k => transcript.includes(k)).length;

    // Decision maker indicators
    const decisionKeywords = ['final decision', 'budget approved', 'authority', 'can decide', 'i decide'];
    const decisionScore = decisionKeywords.filter(k => transcript.includes(k)).length;

    const scores = {
      ANALYTICAL: analyticalScore,
      EMOTIONAL: emotionalScore,
      SKEPTICAL: skepticalScore,
      DECISION_MAKER: decisionScore
    };

    // Return highest scoring profile
    return Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b));
  }

  /**
   * Extract objections from conversation
   *
   * @param {Array} messages - Conversation messages
   * @returns {Array} - List of objections detected
   */
  extractObjections(messages) {
    if (!messages || messages.length === 0) {
      return [];
    }

    const objections = [];
    const transcript = messages.map(m => m.text || '').join(' ').toLowerCase();

    const objectionPatterns = {
      PRICE: ['too expensive', 'cost is high', 'can\'t afford', 'price is too much', 'expensive', 'overpriced'],
      QUALITY: ['quality doubt', 'not sure about quality', 'durability', 'will it last', 'how long'],
      TRUST: ['trust', 'credibility', 'proven', 'verified', 'authentic', 'real'],
      TIMING: ['not ready', 'later', 'wait', 'when', 'soon', 'rush', 'hurry'],
      NEED: ['don\'t need', 'not required', 'what\'s the benefit', 'why should i']
    };

    for (const [type, patterns] of Object.entries(objectionPatterns)) {
      if (patterns.some(p => transcript.includes(p))) {
        objections.push(type);
      }
    }

    return objections;
  }

  /**
   * Get conversation context summary
   *
   * @returns {Object} - Full conversation context
   */
  getConversationContext(messages, callMetadata = {}) {
    return {
      stage: this.determineConversationStage(messages),
      clientProfile: this.determineClientProfile(messages),
      objections: this.extractObjections(messages),
      messageCount: messages ? messages.length : 0,
      conversationDuration: callMetadata.duration || 0,
      discussedTopics: Array.from(this.discussedTopics),
      principlesUsedSoFar: this.principlesUsed
    };
  }

  /**
   * Track conversation for analysis
   *
   * @param {Object} message - Message to track
   */
  trackMessage(message) {
    if (message && message.text) {
      this.conversationHistory.push({
        text: message.text,
        role: message.role,
        timestamp: new Date()
      });
    }
  }

  /**
   * Update tracked principles
   *
   * @param {String} principle - Principle used
   */
  trackPrincipleUsed(principle) {
    this.principlesUsed.push({
      principle,
      timestamp: new Date()
    });
  }

  /**
   * Clear history for new call
   */
  reset() {
    this.conversationHistory = [];
    this.objections = [];
    this.discussedTopics.clear();
    this.principlesUsed = [];
  }
}

export const conversationAnalyzer = new ConversationAnalyzer();
