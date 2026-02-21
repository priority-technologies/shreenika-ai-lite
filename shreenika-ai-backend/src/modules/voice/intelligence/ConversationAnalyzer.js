/**
 * ConversationAnalyzer.js
 * ============================================================
 * Real-time conversation intelligence engine
 * Detects: Stage, Profile, Objections, Language, Sentiment
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

class ConversationAnalyzer {
  constructor() {
    // Keywords and patterns for detection
    this.patterns = {
      // ============================================================
      // STAGE DETECTION
      // ============================================================
      awareness: {
        keywords: [
          'tell me about', 'how does', 'what is', 'explain', 'learn',
          'information', 'features', 'pricing', 'cost', 'alternatives',
          'comparison', 'different', 'better'
        ],
        pattern: /tell me|how does|what is|explain|features|pricing/i
      },

      consideration: {
        keywords: [
          'compare', 'difference', 'how does it work', 'timeline',
          'budget', 'costs', 'implementation', 'requirements', 'must-haves',
          'questions', 'details', 'specifically', 'exactly'
        ],
        pattern: /compare|difference|how|implementation|timeline|budget/i
      },

      decision: {
        keywords: [
          'buy', 'purchase', 'price', 'when can', 'schedule', 'sign up',
          'ready', 'let\'s do', 'next steps', 'confirm', 'agreement',
          'contract', 'payment', 'proceed'
        ],
        pattern: /buy|purchase|when|schedule|let's do|ready|next steps/i
      },

      // ============================================================
      // PROFILE DETECTION
      // ============================================================
      analytical: {
        keywords: [
          'how many', 'what percentage', 'data', 'statistics', 'prove',
          'numbers', 'ROI', 'metrics', 'comparison', 'analysis',
          'research', 'evidence', 'facts', 'details'
        ],
        pattern: /how many|percentage|data|statistics|prove|numbers|ROI|metrics/i
      },

      emotional: {
        keywords: [
          'feel', 'love', 'hate', 'worried', 'excited', 'frustrated',
          'happy', 'sad', 'concerned', 'comfortable', 'trust', 'relationship',
          'understand me', 'connection'
        ],
        pattern: /feel|love|hate|worried|excited|frustrated|happy|comfortable|trust/i
      },

      skeptical: {
        keywords: [
          'really', 'sure', 'guarantee', 'scam', 'trust', 'legitimate',
          'reviews', 'proof', 'verify', 'references', 'testimonials',
          'how do I know', 'why should I believe'
        ],
        pattern: /really|sure|guarantee|scam|trust|legitimate|reviews|proof/i
      },

      decision_maker: {
        keywords: [
          'let\'s do', 'when can', 'schedule', 'sign me up', 'direct',
          'quick', 'fast', 'bottom line', 'action', 'immediately',
          'time is', 'urgent', 'asap'
        ],
        pattern: /let's do|when can|schedule|sign me up|bottom line|asap/i
      },

      relationship_seeker: {
        keywords: [
          'connect', 'understand', 'relationship', 'partnership', 'work together',
          'team', 'collaborate', 'support', 'help', 'guidance', 'mentor'
        ],
        pattern: /connect|relationship|partnership|work together|collaborate|support/i
      },

      // ============================================================
      // OBJECTION DETECTION
      // ============================================================
      price: {
        keywords: ['expensive', 'cost', 'price', 'afford', 'budget', 'cheaper', 'discount'],
        pattern: /expensive|cost|price|afford|budget|cheaper|discount/i
      },

      quality: {
        keywords: ['worth it', 'reliable', 'reviews', 'proof', 'quality', 'durable', 'breakdown'],
        pattern: /worth|reliable|reviews|quality|durable|breakdown/i
      },

      trust: {
        keywords: ['guarantee', 'scam', 'legitimate', 'references', 'trust', 'verify', 'proven'],
        pattern: /guarantee|scam|legitimate|references|trust|verify|proven/i
      },

      timing: {
        keywords: ['later', 'not now', 'thinking', 'busy', 'rush', 'time', 'wait', 'can i call'],
        pattern: /later|not now|thinking|busy|rush|wait|can i call/i
      },

      need: {
        keywords: ['don\'t need', 'have one', 'satisfied', 'unnecessary', 'alternative', 'existing'],
        pattern: /don't need|have one|satisfied|unnecessary|alternative|existing/i
      },

      // ============================================================
      // LANGUAGE DETECTION
      // ============================================================
      marathi: {
        pattern: /आहे|होतो|करतो|पण|मला|तुम्ही|व्हा|अहो|अरे|का/
      },

      hindi: {
        pattern: /है|हो|करता|पर|मुझे|तुम|और|हां|नहीं|क्या|क्यों/
      },

      hinglish: {
        pattern: /\b(hai|hain|nahi|kya|acha|theek|bilkul|samajh|suno|dekho|mat|bhai|yaar)\b/i
      },

      tamil: {
        pattern: /ஆ|ங|ச|ட|த|ப|க|ம|ய|ர|ல|வ|ள|ஞ|ன|ஒ|உ/
      },

      telugu: {
        pattern: /ఆ|ఐ|ఉ|ఎ|ఓ|ఒ|ఔ|ఁ|ం|ః/
      },

      kannada: {
        pattern: /ಆ|ಐ|ಉ|ಎ|ಓ|ಒ|ಔ|ಁ|ಂ|ಃ/
      }
    };

    // Cache for language detection (don't re-detect every turn)
    this.detectedLanguage = null;
    this.detectedProfile = null;
  }

  /**
   * Main analysis method - called every turn
   * @returns {object} Analysis results: stage, profile, objections, language, sentiment
   */
  analyze({ transcript, history, agentProfile }) {
    return {
      stage: this.detectStage(transcript, history),
      profile: this.detectProfile(transcript, history),
      objections: this.detectObjections(transcript),
      language: this.detectLanguage(transcript),
      sentiment: this.analyzeSentiment(transcript, history)
    };
  }

  // ============================================================
  // STAGE DETECTION
  // ============================================================
  /**
   * Detect conversation stage: AWARENESS → CONSIDERATION → DECISION
   */
  detectStage(transcript, history) {
    const turnCount = history.length;
    const text = transcript.toLowerCase();

    // Early conversation → AWARENESS (turns 0-2)
    if (turnCount < 3) {
      return 'AWARENESS';
    }

    // Check for DECISION keywords (highest priority)
    if (this.patterns.decision.pattern.test(text)) {
      return 'DECISION';
    }

    // Check for CONSIDERATION keywords
    if (this.patterns.consideration.pattern.test(text)) {
      return 'CONSIDERATION';
    }

    // Check for AWARENESS keywords
    if (this.patterns.awareness.pattern.test(text)) {
      return 'AWARENESS';
    }

    // Default based on turn count
    if (turnCount < 5) {
      return 'AWARENESS';
    } else if (turnCount < 7) {
      return 'CONSIDERATION';
    } else {
      return 'DECISION';
    }
  }

  // ============================================================
  // PROFILE DETECTION
  // ============================================================
  /**
   * Detect client profile: ANALYTICAL, EMOTIONAL, SKEPTICAL, DECISION_MAKER, RELATIONSHIP_SEEKER
   * Cache result after first detection
   */
  detectProfile(transcript, history) {
    // Use cached profile if available (don't re-detect every turn)
    if (this.detectedProfile) {
      return this.detectedProfile;
    }

    const text = transcript.toLowerCase();
    let scores = {
      ANALYTICAL: 0,
      EMOTIONAL: 0,
      SKEPTICAL: 0,
      DECISION_MAKER: 0,
      RELATIONSHIP_SEEKER: 0
    };

    // Score each profile based on keyword matches
    if (this.patterns.analytical.pattern.test(text)) {
      scores.ANALYTICAL += 3;
    }

    if (this.patterns.emotional.pattern.test(text)) {
      scores.EMOTIONAL += 3;
    }

    if (this.patterns.skeptical.pattern.test(text)) {
      scores.SKEPTICAL += 3;
    }

    if (this.patterns.decision_maker.pattern.test(text)) {
      scores.DECISION_MAKER += 3;
    }

    if (this.patterns.relationship_seeker.pattern.test(text)) {
      scores.RELATIONSHIP_SEEKER += 3;
    }

    // Also check conversation history for patterns
    if (history.length > 0) {
      const lastTurn = history[history.length - 1];
      if (lastTurn.userMessage) {
        const historyText = lastTurn.userMessage.toLowerCase();

        // Accumulate scores
        if (this.patterns.analytical.pattern.test(historyText)) {
          scores.ANALYTICAL += 1;
        }
        if (this.patterns.emotional.pattern.test(historyText)) {
          scores.EMOTIONAL += 1;
        }
      }
    }

    // Find highest score
    let maxScore = 0;
    let detectedProfile = 'RELATIONSHIP_SEEKER'; // Default

    for (const [profile, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedProfile = profile;
      }
    }

    // Cache result
    this.detectedProfile = detectedProfile;

    console.log(`   Profile detection: ${detectedProfile} (score: ${maxScore})`);
    return detectedProfile;
  }

  // ============================================================
  // OBJECTION DETECTION
  // ============================================================
  /**
   * Detect objections: PRICE, QUALITY, TRUST, TIMING, NEED
   * Can return multiple objections
   */
  detectObjections(transcript) {
    const text = transcript.toLowerCase();
    const objections = [];

    if (this.patterns.price.pattern.test(text)) {
      objections.push('PRICE');
    }

    if (this.patterns.quality.pattern.test(text)) {
      objections.push('QUALITY');
    }

    if (this.patterns.trust.pattern.test(text)) {
      objections.push('TRUST');
    }

    if (this.patterns.timing.pattern.test(text)) {
      objections.push('TIMING');
    }

    if (this.patterns.need.pattern.test(text)) {
      objections.push('NEED');
    }

    return objections;
  }

  // ============================================================
  // LANGUAGE DETECTION
  // ============================================================
  /**
   * Detect language: English, Marathi, Hindi, Hinglish, Tamil, Telugu, Kannada
   * Cache result after first detection (don't re-detect every turn)
   */
  detectLanguage(transcript) {
    // Use cached language if already detected
    if (this.detectedLanguage) {
      return this.detectedLanguage;
    }

    // Check for non-English scripts first (more reliable)
    if (this.patterns.marathi.pattern.test(transcript)) {
      this.detectedLanguage = 'Marathi';
      return this.detectedLanguage;
    }

    if (this.patterns.hindi.pattern.test(transcript)) {
      this.detectedLanguage = 'Hindi';
      return this.detectedLanguage;
    }

    if (this.patterns.tamil.pattern.test(transcript)) {
      this.detectedLanguage = 'Tamil';
      return this.detectedLanguage;
    }

    if (this.patterns.telugu.pattern.test(transcript)) {
      this.detectedLanguage = 'Telugu';
      return this.detectedLanguage;
    }

    if (this.patterns.kannada.pattern.test(transcript)) {
      this.detectedLanguage = 'Kannada';
      return this.detectedLanguage;
    }

    // Check for Hinglish (mix of English + Hindi/Marathi)
    if (this.patterns.hinglish.pattern.test(transcript)) {
      this.detectedLanguage = 'Hinglish';
      return this.detectedLanguage;
    }

    // Default to English
    this.detectedLanguage = 'English';
    return this.detectedLanguage;
  }

  // ============================================================
  // SENTIMENT ANALYSIS
  // ============================================================
  /**
   * Analyze sentiment: 0.0 (very negative) to 1.0 (very positive)
   */
  analyzeSentiment(transcript, history) {
    const positiveWords = [
      'good', 'great', 'excellent', 'love', 'yes', 'sure',
      'absolutely', 'definitely', 'perfect', 'wonderful', 'amazing',
      'interested', 'excited', 'thrilled', 'happy', 'pleased'
    ];

    const negativeWords = [
      'bad', 'hate', 'no', 'never', 'terrible', 'awful',
      'frustrated', 'angry', 'disappointed', 'unhappy', 'worse',
      'problem', 'issue', 'broken', 'doesn\'t work'
    ];

    const text = transcript.toLowerCase();
    let score = 0.5; // Neutral baseline

    // Count positive words
    positiveWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`);
      if (regex.test(text)) {
        score += 0.1;
      }
    });

    // Count negative words
    negativeWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`);
      if (regex.test(text)) {
        score -= 0.1;
      }
    });

    // Check for intensifiers
    if (/very|really|so|extremely|incredibly/.test(text)) {
      // Increase magnitude
      if (score > 0.5) {
        score += 0.05; // More positive
      } else {
        score -= 0.05; // More negative
      }
    }

    // Clamp between 0-1
    score = Math.max(0, Math.min(1, score));

    // Map to human-readable sentiment
    let sentiment = 'Neutral';
    if (score >= 0.7) {
      sentiment = 'Very Positive';
    } else if (score >= 0.6) {
      sentiment = 'Positive';
    } else if (score >= 0.4) {
      sentiment = 'Neutral';
    } else if (score >= 0.3) {
      sentiment = 'Negative';
    } else {
      sentiment = 'Very Negative';
    }

    return {
      score: score,
      sentiment: sentiment
    };
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Reset language and profile detection for new agent
   */
  reset() {
    this.detectedLanguage = null;
    this.detectedProfile = null;
  }

  /**
   * Get analysis summary (for logging/debugging)
   */
  getSummary(transcript, history, agentProfile) {
    const analysis = this.analyze({ transcript, history, agentProfile });

    return {
      stage: analysis.stage,
      profile: analysis.profile,
      objections: analysis.objections.join(', ') || 'None',
      language: analysis.language,
      sentiment: `${analysis.sentiment.sentiment} (${analysis.sentiment.score.toFixed(2)})`
    };
  }
}

module.exports = ConversationAnalyzer;
