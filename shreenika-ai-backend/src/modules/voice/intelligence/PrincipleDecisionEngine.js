/**
 * PrincipleDecisionEngine.js
 * ============================================================
 * Psychological Principle Selection Engine
 * Selects appropriate principle based on conversation context
 * 6 Principles: RECIPROCITY, COMMITMENT, SOCIAL_PROOF, AUTHORITY, LIKING, SCARCITY
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

class PrincipleDecisionEngine {
  constructor() {
    /**
     * 6 Core Psychological Principles
     * Each principle has:
     * - Definition
     * - When to use (stages)
     * - Which profiles it works for
     * - Which objections it addresses
     */
    this.principles = {
      RECIPROCITY: {
        name: 'Reciprocity',
        definition: 'People feel obligated to return favors or match others\' behavior',
        whenToUse: 'Give value first (free trial, consultation, info)',
        example: 'Let me share a case study that might help you...',
        stages: ['AWARENESS', 'CONSIDERATION'],
        profiles: ['ANALYTICAL', 'RELATIONSHIP_SEEKER'],
        addressesObjections: ['PRICE', 'NEED'],
        systemPromptInjection: `
          You are demonstrating reciprocity.
          - Give value first without immediate expectation
          - Provide genuine help and insights
          - Make the customer feel you're on their side
          - Reference case studies or success stories
          - Create obligation for them to listen more
        `
      },

      COMMITMENT: {
        name: 'Commitment',
        definition: 'People honor their stated commitments, especially public ones',
        whenToUse: 'Get small yes first, then bigger yes',
        example: 'Would you like to see how this works for your case?',
        stages: ['CONSIDERATION', 'DECISION'],
        profiles: ['DECISION_MAKER', 'ANALYTICAL'],
        addressesObjections: ['TIMING'],
        systemPromptInjection: `
          You are leveraging commitment principle.
          - Reference what the customer already agreed to
          - Ask for incremental commitments (small YES first)
          - Build on established agreements
          - Use "as you mentioned earlier..." frequently
          - Make them honor their stated priorities
        `
      },

      SOCIAL_PROOF: {
        name: 'Social Proof',
        definition: 'Show others are doing it - people follow the crowd',
        whenToUse: 'Demonstrate that similar clients succeeded',
        example: 'We\'ve helped 500+ clients in your industry...',
        stages: ['AWARENESS', 'CONSIDERATION'],
        profiles: ['SKEPTICAL', 'ANALYTICAL'],
        addressesObjections: ['TRUST', 'QUALITY'],
        systemPromptInjection: `
          You are using social proof.
          - Share success stories from similar clients
          - Quote statistics about your success rate
          - Reference industry leaders or well-known companies
          - Show reviews, ratings, or testimonials
          - Make them realize "everyone else is doing this"
        `
      },

      AUTHORITY: {
        name: 'Authority',
        definition: 'People trust and follow authority figures and experts',
        whenToUse: 'Establish expertise and credibility',
        example: 'Based on our 15 years in this field...',
        stages: ['AWARENESS', 'CONSIDERATION'],
        profiles: ['SKEPTICAL', 'ANALYTICAL'],
        addressesObjections: ['TRUST', 'QUALITY'],
        systemPromptInjection: `
          You are establishing authority.
          - Share relevant credentials and experience
          - Cite statistics and data to support claims
          - Mention years of expertise in this field
          - Reference industry standards or benchmarks
          - Use confident, assured tone
          - Share credentials early and often
        `
      },

      LIKING: {
        name: 'Liking',
        definition: 'People prefer and buy from those they like',
        whenToUse: 'Build genuine connection and rapport',
        example: 'I completely understand your concern...',
        stages: ['AWARENESS', 'CONSIDERATION', 'DECISION'],
        profiles: ['EMOTIONAL', 'RELATIONSHIP_SEEKER'],
        addressesObjections: ['TRUST'],
        systemPromptInjection: `
          You are building liking principle.
          - Use customer's name frequently (1-2x per response)
          - Find common ground or shared interests
          - Show genuine enthusiasm for helping them
          - Acknowledge their feelings and perspectives
          - Use warm, conversational tone
          - Give genuine compliments when appropriate
          - Show that you care about their success
        `
      },

      SCARCITY: {
        name: 'Scarcity',
        definition: 'People value things more when they\'re rare or limited',
        whenToUse: 'Create urgency (use carefully with SKEPTICAL!)',
        example: 'This offer is available until Friday...',
        stages: ['DECISION'],
        profiles: ['DECISION_MAKER'],
        addressesObjections: ['TIMING'],
        caution: 'Do NOT overuse - can backfire with SKEPTICAL profile. Only use genuine scarcity.',
        systemPromptInjection: `
          You are using scarcity principle (carefully!).
          - Mention limited availability (only if genuine)
          - Reference time constraints
          - Create FOMO (fear of missing out) ethically
          - Emphasize exclusivity
          - Avoid sounding pushy or manipulative
        `
      }
    };

    // Track recently used principles (avoid repetition)
    this.recentlyUsed = [];
    this.turnsSincePrincipleChange = 0;
  }

  /**
   * Main principle selection method
   * Called once per turn during THINKING state
   * @param {object} context - { stage, profile, objections, turnNumber }
   * @returns {string} Selected principle name
   */
  selectPrinciple({ stage, profile, objections, turnNumber }) {
    console.log(`\n   🧠 Principle Selection Engine`);
    console.log(`      Input: Stage=${stage}, Profile=${profile}, Objections=${objections.join(', ') || 'None'}`);

    // Step 1: Filter principles by stage
    let candidates = this._filterByStage(stage);
    console.log(`      ✓ Stage filter: ${candidates.join(', ')}`);

    // Step 2: Filter by profile
    candidates = this._filterByProfile(candidates, profile);
    console.log(`      ✓ Profile filter: ${candidates.join(', ')}`);

    // Step 3: Prioritize if objection present
    if (objections.length > 0) {
      const objectionCandidates = this._filterByObjections(candidates, objections);
      if (objectionCandidates.length > 0) {
        console.log(`      ✓ Objection filter: ${objectionCandidates.join(', ')}`);
        candidates = objectionCandidates;
      }
    }

    // Step 4: Avoid repetition (don't use same principle twice in a row)
    candidates = this._filterByRecency(candidates);
    console.log(`      ✓ Recency filter: ${candidates.join(', ')}`);

    // If no candidates left, reset recently used and try again
    if (candidates.length === 0) {
      console.log(`      ⚠️  No candidates after filters, resetting recently used`);
      this.recentlyUsed = [];
      candidates = Object.keys(this.principles);
    }

    // Step 5: Select best principle
    const selected = candidates[0];

    // Track usage
    this.recentlyUsed.push(selected);
    if (this.recentlyUsed.length > 2) {
      this.recentlyUsed.shift(); // Keep only last 2
    }

    this.turnsSincePrincipleChange++;

    console.log(`      ✅ Selected: ${selected}`);

    return selected;
  }

  // ============================================================
  // FILTERING METHODS
  // ============================================================

  /**
   * Filter principles by conversation stage
   */
  _filterByStage(stage) {
    const stageFilters = {
      AWARENESS: ['AUTHORITY', 'LIKING', 'SOCIAL_PROOF'],
      CONSIDERATION: ['RECIPROCITY', 'ANCHORING', 'COMMITMENT', 'LIKING'],
      DECISION: ['COMMITMENT', 'SCARCITY', 'LIKING']
    };

    return stageFilters[stage] || [];
  }

  /**
   * Filter principles by client profile
   */
  _filterByProfile(candidates, profile) {
    const filtered = candidates.filter(principle => {
      const principleObj = this.principles[principle];
      if (!principleObj) return false;

      return principleObj.profiles.includes(profile);
    });

    // If no matches, return all candidates (soft filter)
    return filtered.length > 0 ? filtered : candidates;
  }

  /**
   * Filter principles that address detected objections
   */
  _filterByObjections(candidates, objections) {
    const filtered = candidates.filter(principle => {
      const principleObj = this.principles[principle];
      if (!principleObj) return false;

      // Check if this principle addresses any of the objections
      return objections.some(objection =>
        principleObj.addressesObjections.includes(objection)
      );
    });

    // If no matches, return all candidates (soft filter)
    return filtered.length > 0 ? filtered : candidates;
  }

  /**
   * Filter out recently used principles (avoid repetition)
   */
  _filterByRecency(candidates) {
    const filtered = candidates.filter(principle =>
      !this.recentlyUsed.includes(principle)
    );

    // If all candidates are recent, allow repetition
    return filtered.length > 0 ? filtered : candidates;
  }

  // ============================================================
  // SYSTEM PROMPT INJECTION
  // ============================================================

  /**
   * Get system prompt instructions for selected principle
   * Used to inject principle guidance into Gemini's system prompt
   */
  getPrincipleInstruction(principle) {
    const principleObj = this.principles[principle];

    if (!principleObj) {
      return '';
    }

    return principleObj.systemPromptInjection;
  }

  /**
   * Build full system prompt with principle injection
   * Called during THINKING state before sending to Gemini
   */
  buildSystemPromptWithPrinciple(agentProfile, selectedPrinciple) {
    const principle = this.principles[selectedPrinciple];

    if (!principle) {
      console.warn(`Unknown principle: ${selectedPrinciple}`);
      return '';
    }

    return `
    ============================================================
    YOU ARE: ${agentProfile.agentName}
    ROLE: ${agentProfile.primaryObjective}
    PERSONALITY: ${agentProfile.agentPersonality || 'Professional and helpful'}
    ============================================================

    CURRENT PSYCHOLOGICAL PRINCIPLE: ${principle.name.toUpperCase()}
    Definition: ${principle.definition}
    When to use: ${principle.whenToUse}

    ${principle.systemPromptInjection}

    ============================================================
    VOICE SETTINGS:
    - Tone: ${agentProfile.voiceCharacteristics?.tone || 'Professional'}
    - Emotion Level: ${agentProfile.voiceCharacteristics?.emotionLevel || 0.5} (0=calm, 1=enthusiastic)
    - Speed: ${agentProfile.voiceCharacteristics?.speed || 1.0}x (0.75=slow, 1.25=fast)

    ============================================================
    CRITICAL RULES:
    1. Stay in character as ${agentProfile.agentName}
    2. Apply the ${principle.name} principle consistently
    3. Keep responses concise (1-3 sentences maximum)
    4. Ask questions to keep conversation flowing
    5. Listen more, talk less
    6. Be genuine and authentic
    ============================================================
    `;
  }

  // ============================================================
  // ANALYTICS & DEBUGGING
  // ============================================================

  /**
   * Get principle info for logging/analytics
   */
  getPrincipleInfo(principle) {
    return this.principles[principle] || null;
  }

  /**
   * Get all principles (for reference)
   */
  getAllPrinciples() {
    return Object.keys(this.principles);
  }

  /**
   * Reset engine state
   */
  reset() {
    this.recentlyUsed = [];
    this.turnsSincePrincipleChange = 0;
  }

  /**
   * Get decision summary (for logging/debugging)
   */
  getDecisionSummary(stage, profile, objections, selectedPrinciple) {
    return {
      stage: stage,
      profile: profile,
      objections: objections,
      selectedPrinciple: selectedPrinciple,
      principleDefinition: this.principles[selectedPrinciple]?.definition,
      reasoning: `${profile} in ${stage} stage with ${objections.length > 0 ? 'objections: ' + objections.join(', ') : 'no objections'}`
    };
  }
}

module.exports = PrincipleDecisionEngine;
