/**
 * Psychology Engine — Dynamic Ratio Blending
 * 6 Principles: Reciprocity, Authority, Social Proof, Liking, Scarcity, Commitment
 * Initial Ratio: 70/30 (task focus / psychology)
 * Max shift per turn: 15%
 */

const PSYCHOLOGY_PRINCIPLES = {
  RECIPROCITY: {
    name: 'Reciprocity',
    description: 'Give value first to receive',
    prompt: 'Offer something valuable upfront — a free tip, insight, or help — before making any request.',
    triggers: ['free', 'offer', 'gift', 'help', 'value']
  },
  AUTHORITY: {
    name: 'Authority',
    description: 'Establish expertise and credibility',
    prompt: 'Reference expertise, credentials, data, or industry knowledge to build trust and credibility.',
    triggers: ['expert', 'proven', 'research', 'years', 'certified', 'trusted']
  },
  SOCIAL_PROOF: {
    name: 'Social Proof',
    description: 'Others are doing it',
    prompt: 'Mention that many customers or peers use this solution successfully. Use numbers when possible.',
    triggers: ['customers', 'users', 'people', 'popular', 'everyone', 'majority']
  },
  LIKING: {
    name: 'Liking',
    description: 'Build rapport and connection',
    prompt: 'Be warm, use the person\'s perspective, find common ground, show genuine interest in their needs.',
    triggers: ['understand', 'relate', 'similar', 'agree', 'appreciate']
  },
  SCARCITY: {
    name: 'Scarcity',
    description: 'Create urgency through limited availability',
    prompt: 'Mention limited time offers, limited availability, or exclusive access to create urgency.',
    triggers: ['limited', 'exclusive', 'only', 'deadline', 'urgent', 'last']
  },
  COMMITMENT: {
    name: 'Commitment',
    description: 'Get small agreements first',
    prompt: 'Ask for small commitments first that naturally lead to larger ones. Reference past agreements.',
    triggers: ['agree', 'commit', 'promise', 'confirm', 'yes', 'start']
  }
};

class PsychologyEngine {
  constructor() {
    this.turnHistory = [];
    this.currentRatio = { task: 70, psychology: 30 }; // Initial 70/30
    this.maxShiftPerTurn = 15;
  }

  /**
   * Build psychology-enhanced system prompt
   * @param {object} agent - Agent config
   * @param {string[]} selectedPrinciples - Principles to apply
   * @param {string} userInput - Current user message
   * @returns {object} - Enhanced prompt + metadata
   */
  buildEnhancedPrompt(agent, selectedPrinciples, userInput) {
    // Detect sentiment and engagement from input
    const sentiment = this._detectSentiment(userInput);
    const isObjection = this._detectObjection(userInput);
    const engagementLevel = this._detectEngagement(userInput);

    // Adjust ratio based on context
    this._adjustRatio(sentiment, isObjection, engagementLevel);

    // Filter to valid principles
    const activePrinciples = selectedPrinciples
      .map(p => p.toUpperCase().replace(/ /g, '_'))
      .filter(p => PSYCHOLOGY_PRINCIPLES[p])
      .map(p => PSYCHOLOGY_PRINCIPLES[p]);

    // Build psychology instructions
    const psychologyInstructions = activePrinciples
      .map(p => `[${p.name.toUpperCase()}]: ${p.prompt}`)
      .join('\n');

    // Build complete system prompt
    const systemPrompt = `${agent.systemPrompt || this._buildDefaultSystemPrompt(agent)}

=== PSYCHOLOGY PRINCIPLES (${this.currentRatio.psychology}% weight) ===
Apply these principles naturally — NOT robotically. Blend them into conversation:
${psychologyInstructions || 'Be genuinely helpful and build trust.'}

=== COMMUNICATION RULES ===
- Language: ${agent.language || 'English'}
- Voice Tone: ${agent.voiceTone || 'Professional and warm'}
- Response Style: Conversational, concise (2-4 sentences max)
- Task Focus: ${this.currentRatio.task}% | Psychology: ${this.currentRatio.psychology}%
- If objection detected: Acknowledge first, then address with evidence
- NEVER be pushy — be helpful and consultative

=== CONTEXT ===
Sentiment detected: ${sentiment}
Objection detected: ${isObjection ? 'YES — handle with empathy' : 'NO'}
Engagement level: ${engagementLevel}`;

    return {
      systemPrompt,
      metadata: {
        principlesApplied: activePrinciples.map(p => p.name),
        currentRatio: { ...this.currentRatio },
        sentiment,
        isObjection,
        engagementLevel
      }
    };
  }

  _buildDefaultSystemPrompt(agent) {
    return `You are ${agent.agentName || 'an AI assistant'}, a ${agent.agentRole || 'sales'} agent for ${agent.company || 'our company'}.

Your Objective: ${agent.agentObjective || 'Help customers and provide excellent service'}

Welcome Message: ${agent.welcomeMessage || 'Hello! How can I help you today?'}

Key Characteristics: ${(agent.characteristics || ['Professional', 'Helpful']).join(', ')}`;
  }

  _detectSentiment(input) {
    const positive = ['good', 'great', 'excellent', 'happy', 'love', 'perfect', 'yes', 'interested'];
    const negative = ['no', 'bad', 'expensive', 'problem', 'issue', 'hate', 'waste', 'never'];
    const neutral = ['maybe', 'perhaps', 'think', 'consider', 'possibly'];

    const lower = input.toLowerCase();
    const posScore = positive.filter(w => lower.includes(w)).length;
    const negScore = negative.filter(w => lower.includes(w)).length;

    if (posScore > negScore) return 'positive';
    if (negScore > posScore) return 'negative';
    return 'neutral';
  }

  _detectObjection(input) {
    const objectionWords = ['expensive', 'costly', 'too much', 'not sure', 'maybe later', 'think about', 'not interested', 'already have', 'competitor'];
    const lower = input.toLowerCase();
    return objectionWords.some(w => lower.includes(w));
  }

  _detectEngagement(input) {
    if (input.length > 100) return 'high';
    if (input.includes('?')) return 'medium';
    if (input.length < 20) return 'low';
    return 'medium';
  }

  _adjustRatio(sentiment, isObjection, engagement) {
    let shift = 0;
    if (isObjection) shift += 10; // More psychology when objection
    if (sentiment === 'negative') shift += 5;
    if (engagement === 'high') shift -= 5; // Less psychology when very engaged
    if (sentiment === 'positive') shift -= 5;

    // Cap at max shift per turn
    shift = Math.max(-this.maxShiftPerTurn, Math.min(this.maxShiftPerTurn, shift));

    this.currentRatio.psychology = Math.max(10, Math.min(60, this.currentRatio.psychology + shift));
    this.currentRatio.task = 100 - this.currentRatio.psychology;
  }
}

module.exports = { PsychologyEngine, PSYCHOLOGY_PRINCIPLES };
