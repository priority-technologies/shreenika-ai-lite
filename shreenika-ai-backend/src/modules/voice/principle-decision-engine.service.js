/**
 * Principle Decision Engine
 *
 * Selects the most appropriate psychological principle for the current conversation stage,
 * client profile, and objections.
 *
 * The 6 Psychological Principles:
 * 1. LIKING - Build rapport through similarity, compliments, cooperation
 * 2. AUTHORITY - Establish credibility through expertise and authority
 * 3. RECIPROCITY - Create obligation to return favors and information
 * 4. ANCHORING - Set initial price/value expectations to frame the deal
 * 5. SCARCITY - Emphasize limited availability or limited time offers
 * 6. COMMITMENT - Reference client's prior statements and commitments
 */

export class PrincipleDecisionEngine {
  constructor() {
    this.principles = {
      LIKING: 'Build rapport, find common ground, compliment, emphasize similarity',
      AUTHORITY: 'Establish expert credibility, cite statistics, share credentials',
      RECIPROCITY: 'Provide free value first, create sense of obligation',
      ANCHORING: 'Set the initial price/value frame, anchor expectations',
      SCARCITY: 'Emphasize limited availability, time-sensitive offers, exclusivity',
      COMMITMENT: 'Reference client\'s prior statements, consistency principle'
    };

    this.principleInstructions = {
      LIKING: {
        tone: 'Warm, personable, friendly',
        approach: 'Find common ground, emphasize similarity, give genuine compliments',
        voiceGuidance: 'Slower, more conversational pace, warm tone',
        tactics: [
          'Comment on shared experiences or values',
          'Use their name frequently',
          'Show genuine interest in their situation',
          'Emphasize working together ("we", "our")'
        ]
      },
      AUTHORITY: {
        tone: 'Confident, knowledgeable, professional',
        approach: 'Cite statistics, share credentials, reference expert opinions',
        voiceGuidance: 'Clear, deliberate, assured tone',
        tactics: [
          'Share relevant statistics and data',
          'Mention qualifications and experience',
          'Reference industry experts and studies',
          'Demonstrate deep product knowledge'
        ]
      },
      RECIPROCITY: {
        tone: 'Generous, helpful, supportive',
        approach: 'Provide value upfront before asking for commitment',
        voiceGuidance: 'Helpful, genuine, eager to assist',
        tactics: [
          'Offer free consultation or assessment',
          'Share valuable information without asking for anything',
          'Provide resources or tools',
          'Demonstrate that you\'re invested in their success'
        ]
      },
      ANCHORING: {
        tone: 'Confident, clear, matter-of-fact',
        approach: 'State the initial price/value frame early and clearly',
        voiceGuidance: 'Steady, assured, factual',
        tactics: [
          'State the price or value proposition first',
          'Provide context for why that\'s the right price',
          'Reference higher-priced alternatives to anchor value',
          'Discuss why this price represents excellent value'
        ]
      },
      SCARCITY: {
        tone: 'Urgent, excited, time-sensitive',
        approach: 'Emphasize limited availability or limited-time offers',
        voiceGuidance: 'Slightly faster pace, sense of urgency',
        tactics: [
          'Mention limited spots or inventory',
          'Reference deadline for offer',
          'Discuss high demand from other clients',
          'Emphasize exclusivity of the offer'
        ]
      },
      COMMITMENT: {
        tone: 'Reflective, consistency-focused, logical',
        approach: 'Reference their own prior statements and values',
        voiceGuidance: 'Thoughtful, deliberate, logical',
        tactics: [
          'Quote their own stated needs back to them',
          'Reference their values or priorities they mentioned',
          'Point out how this aligns with their stated goals',
          'Emphasize consistency between their words and this solution'
        ]
      }
    };
  }

  /**
   * Decide which principle(s) to use based on conversation context
   *
   * @param {Object} conversationContext - From ConversationAnalyzer.getConversationContext()
   * @returns {Object} - { primary, secondary, reasoning, instructions, priority }
   */
  decidePrinciple(conversationContext) {
    const { stage, clientProfile, objections } = conversationContext;

    // Stage-based primary selection
    let stagePrinciple = this._selectByStage(stage);

    // Client profile modifiers
    let clientModifier = this._selectByProfile(clientProfile);

    // Objection-driven adjustments
    let objectionAdjustment = this._selectByObjections(objections, stage);

    // Combine and prioritize
    const decision = this._combinePrinciples(stagePrinciple, clientModifier, objectionAdjustment);

    return {
      primary: decision.primary,
      secondary: decision.secondary,
      reasoning: decision.reasoning,
      instructions: this.principleInstructions[decision.primary],
      voiceGuidance: this.principleInstructions[decision.primary].voiceGuidance,
      priority: decision.priority,
      tactics: this.principleInstructions[decision.primary].tactics,
      conversationStage: stage,
      clientProfile: clientProfile,
      objections: objections,
      timestamp: new Date()
    };
  }

  /**
   * Select principle based on conversation stage
   *
   * @private
   */
  _selectByStage(stage) {
    const stageMap = {
      AWARENESS: {
        primary: 'AUTHORITY',
        secondary: 'LIKING',
        reasoning: 'In awareness stage, establish credibility and build initial rapport'
      },
      CONSIDERATION: {
        primary: 'ANCHORING',
        secondary: 'RECIPROCITY',
        reasoning: 'In consideration stage, set value expectations and show what you offer'
      },
      DECISION: {
        primary: 'COMMITMENT',
        secondary: 'SCARCITY',
        reasoning: 'In decision stage, reference their own stated needs and create urgency'
      }
    };

    return stageMap[stage] || stageMap['AWARENESS'];
  }

  /**
   * Select principle based on client profile
   *
   * @private
   */
  _selectByProfile(clientProfile) {
    const profileMap = {
      ANALYTICAL: {
        modifier: 'AUTHORITY',
        reasoning: 'Analytical clients respond to data, credentials, and expert credibility'
      },
      EMOTIONAL: {
        modifier: 'LIKING',
        reasoning: 'Emotional clients value personal connection and relationship building'
      },
      SKEPTICAL: {
        modifier: 'AUTHORITY',
        reasoning: 'Skeptical clients need credible proof and expert validation'
      },
      DECISION_MAKER: {
        modifier: 'COMMITMENT',
        reasoning: 'Decision-makers value consistency with their stated priorities'
      }
    };

    return profileMap[clientProfile] || profileMap['ANALYTICAL'];
  }

  /**
   * Select principle based on detected objections
   *
   * @private
   */
  _selectByObjections(objections, stage) {
    if (!objections || objections.length === 0) {
      return null;
    }

    const objectionMap = {
      PRICE: {
        principle: 'ANCHORING',
        alternates: ['SCARCITY', 'RECIPROCITY'],
        reasoning: 'Price objection requires reframing value and creating scarcity'
      },
      QUALITY: {
        principle: 'AUTHORITY',
        alternates: ['LIKING', 'RECIPROCITY'],
        reasoning: 'Quality concerns need credible evidence and expert assurance'
      },
      TRUST: {
        principle: 'AUTHORITY',
        alternates: ['LIKING', 'COMMITMENT'],
        reasoning: 'Trust issues require credentials, social proof, and consistency'
      },
      TIMING: {
        principle: 'SCARCITY',
        alternates: ['COMMITMENT', 'RECIPROCITY'],
        reasoning: 'Timing objections respond to deadline/urgency and value-first approach'
      },
      NEED: {
        principle: 'RECIPROCITY',
        alternates: ['LIKING', 'COMMITMENT'],
        reasoning: 'Need questions require showing value and referencing their stated goals'
      }
    };

    // Use the first (most impactful) objection
    const primaryObjection = objections[0];
    return objectionMap[primaryObjection] || null;
  }

  /**
   * Combine stage, profile, and objection principles into final decision
   *
   * @private
   */
  _combinePrinciples(stagePrinciple, clientModifier, objectionAdjustment) {
    let primary = stagePrinciple.primary;
    let secondary = stagePrinciple.secondary;
    let reasoning = stagePrinciple.reasoning;

    // If objection adjustment exists and conflicts with stage, prioritize objection
    if (objectionAdjustment && objectionAdjustment.principle !== primary) {
      // Use objection principle as primary if it's more specific
      secondary = primary;
      primary = objectionAdjustment.principle;
      reasoning = objectionAdjustment.reasoning + ' | Also addressing: ' + objectionAdjustment.reasoning;
    }

    // Client modifier influences secondary or tertiary
    // If modifier is same as primary, it's reinforcement (high priority)
    // If modifier is same as secondary, they align (medium priority)
    // If modifier is different, it becomes a consideration (note in reasoning)
    const clientModifierPriority = clientModifier.modifier === primary ? 'REINFORCED' : 'NOTED';

    return {
      primary,
      secondary,
      reasoning: `${reasoning} | Client Profile: ${clientModifier.reasoning} (${clientModifierPriority})`,
      priority: this._calculatePriority(primary, objectionAdjustment)
    };
  }

  /**
   * Calculate priority level for principle application
   *
   * @private
   */
  _calculatePriority(principle, objectionAdjustment) {
    // If we have an active objection, priority is CRITICAL
    if (objectionAdjustment) {
      return 'CRITICAL'; // Active objection to overcome
    }

    // Otherwise, priority is based on principle effectiveness
    const priorityMap = {
      COMMITMENT: 'HIGH',
      SCARCITY: 'HIGH',
      AUTHORITY: 'MEDIUM',
      ANCHORING: 'MEDIUM',
      RECIPROCITY: 'MEDIUM',
      LIKING: 'ONGOING'
    };

    return priorityMap[principle] || 'MEDIUM';
  }

  /**
   * Get full principle information
   *
   * @param {String} principle - Principle name (LIKING, AUTHORITY, etc.)
   * @returns {Object}
   */
  getPrincipleInfo(principle) {
    return {
      name: principle,
      definition: this.principles[principle],
      instructions: this.principleInstructions[principle]
    };
  }

  /**
   * Get all principles
   *
   * @returns {Object}
   */
  getAllPrinciples() {
    return this.principles;
  }

  /**
   * Get all instructions
   *
   * @returns {Object}
   */
  getAllInstructions() {
    return this.principleInstructions;
  }
}

// Export singleton
export const principleDecisionEngine = new PrincipleDecisionEngine();
