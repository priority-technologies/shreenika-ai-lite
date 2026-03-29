/**
 * Principle Injector Service (Milestone 3)
 *
 * Converts psychology principles (selected by PrincipleDecisionEngine) into
 * actionable Gemini instructions. Handles weighted blending of primary and
 * secondary principles (70/30 split).
 *
 * 6 Psychology Principles (from Cialdini):
 * 1. RECIPROCITY — "People feel obligated to repay favors"
 * 2. AUTHORITY — "People trust and follow experts"
 * 3. LIKING — "People prefer those they like"
 * 4. ANCHORING — "First number anchors perception"
 * 5. SCARCITY — "Limited things seem more valuable"
 * 6. COMMITMENT — "People stick to their commitments"
 *
 * Purpose:
 * - Convert abstract principles into concrete behavioral instructions
 * - Emit instructions to InjectionQueue (not direct Gemini send)
 * - Enable psychology-driven conversational control
 */

export class PrincipleInjectorService {
  constructor(injectionQueue) {
    this.injectionQueue = injectionQueue;

    // Principle definitions: How to apply each principle in conversation
    this.principleDefinitions = {
      RECIPROCITY: {
        description: 'Make caller feel like you\'ve given value first',
        instructions: [
          'Start by offering something valuable: a tip, insight, or exclusive information',
          'Then smoothly ask for their commitment or decision',
          'Emphasize: "I\'ve shared this with you first because..."'
        ]
      },

      AUTHORITY: {
        description: 'Position yourself as a trustworthy expert',
        instructions: [
          'Cite relevant statistics, credentials, or research',
          'Reference years of experience or proven track records',
          'Use confident language: "Based on 500+ successful calls..."',
          'Quote industry standards or expert opinions'
        ]
      },

      LIKING: {
        description: 'Build rapport and connection with the caller',
        instructions: [
          'Use their name frequently in a natural way',
          'Find commonalities and mention them',
          'Use warm, conversational tone (avoid jargon)',
          'Give genuine compliments about their choice to listen'
        ]
      },

      ANCHORING: {
        description: 'Frame the discussion with favorable reference points',
        instructions: [
          'Mention the highest price/value first (anchors perception)',
          'Then reveal actual price seems more reasonable by comparison',
          'Use anchors like: "Industry standard is ₹500, we\'re at ₹250"',
          'Position your offer as the better value anchor'
        ]
      },

      SCARCITY: {
        description: 'Create urgency through limited availability',
        instructions: [
          'Mention limited slots, limited-time offers, or exclusivity',
          'Use phrases like: "Only 3 left", "Expires tomorrow", "VIP access"',
          'Emphasize what they\'ll miss if they don\'t decide now',
          'Highlight that others have already chosen this option'
        ]
      },

      COMMITMENT: {
        description: 'Get small agreements leading to bigger commitment',
        instructions: [
          'Start with small, easy commitments (agree on value)',
          'Then build to bigger commitments (book a demo, sign up)',
          'Use: "You\'ve already said X is important, this helps achieve that"',
          'Once committed, remind them: "This aligns with what you said..."'
        ]
      },

      SOCIAL_PROOF: {
        description: 'Show that others have made similar choices',
        instructions: [
          'Share customer testimonials and success stories',
          'Mention: "95% of similar companies chose this"',
          'Reference case studies and real results',
          'Emphasize: "You\'d be in good company"'
        ]
      },

      DECOY_EFFECT: {
        description: 'Make primary option seem better by adding a decoy',
        instructions: [
          'Present three options: decoy (worst), good, best',
          'The decoy makes the "good" option look superior',
          'Frame: "This option is right in the middle and most popular"',
          'Let them feel like they\'re making the smart choice'
        ]
      }
    };

    console.log('💡 Principle Injector Service initialized');
  }

  /**
   * Build a behavioral instruction from one principle
   *
   * @param {string} principle - Principle name (e.g., "RECIPROCITY")
   * @param {number} weight - 1.0 for full weight, 0.3 for secondary
   * @returns {string} - Instruction text
   */
  buildPrincipleInstruction(principle, weight = 1.0) {
    const def = this.principleDefinitions[principle];

    if (!def) {
      console.warn(`[INJECTOR] Unknown principle: ${principle}, skipping`);
      return '';
    }

    // Select instructions based on principle weight
    const selectedInstructions = weight >= 1.0
      ? def.instructions // Full weight: all instructions
      : def.instructions.slice(0, Math.ceil(def.instructions.length * weight)); // Partial weight: subset

    const instruction = `
## Apply ${principle} Principle

**Approach**: ${def.description}

**Concrete Actions**:
${selectedInstructions.map(instr => `- ${instr}`).join('\n')}

**Key Phrase** (use naturally in conversation):
${this._getKeyPhraseForPrinciple(principle, weight)}
`.trim();

    return instruction;
  }

  /**
   * Get a signature phrase for a principle
   *
   * @param {string} principle
   * @param {number} weight
   * @returns {string}
   */
  _getKeyPhraseForPrinciple(principle, weight) {
    const phrases = {
      RECIPROCITY: '"I\'ve already shared this insight with you, so..."',
      AUTHORITY: '"Based on our experience with 500+ similar situations..."',
      LIKING: '"I can tell you\'re someone who values quality, like we do..."',
      ANCHORING: '"Most options in this space are ₹1000+, we\'re at ₹250..."',
      SCARCITY: '"We only have 3 slots left this month..."',
      COMMITMENT: '"You mentioned X is important, and this delivers exactly that..."',
      SOCIAL_PROOF: '"95% of companies similar to yours have already chosen..."',
      DECOY_EFFECT: '"This middle option is what most people choose for good reason..."'
    };

    return phrases[principle] || '"Let me explain why this makes sense..."';
  }

  /**
   * Build injection for a single principle or dual (primary + secondary)
   *
   * @param {Array|string} principles - Single principle string OR array of [primary, secondary]
   * @returns {string} - Combined instruction text
   */
  buildInjectionPrompt(principles) {
    if (!principles || principles.length === 0) {
      return '';
    }

    // Handle both string and array inputs
    let primaryPrinciple, secondaryPrinciple;

    if (typeof principles === 'string') {
      primaryPrinciple = principles;
      secondaryPrinciple = null;
    } else if (Array.isArray(principles)) {
      [primaryPrinciple, secondaryPrinciple] = principles;
    } else {
      return '';
    }

    // Build instructions with proper weighting
    let combinedInstruction = 'You are a persuasive conversation specialist. Apply the following psychology principles:\n\n';

    // Primary principle (100% weight)
    if (primaryPrinciple) {
      const primaryInstr = this.buildPrincipleInstruction(primaryPrinciple, 1.0);
      combinedInstruction += primaryInstr;

      // Secondary principle (30% weight - focus on key phrases and light touch)
      if (secondaryPrinciple) {
        combinedInstruction += '\n\n---\n\n';
        combinedInstruction += '(Secondary, lighter touch)\n';
        const secondaryInstr = this.buildPrincipleInstruction(secondaryPrinciple, 0.3);
        combinedInstruction += secondaryInstr;

        console.log(`[INJECTOR] Weighted blend: ${primaryPrinciple} (70%) + ${secondaryPrinciple} (30%)`);
      }
    }

    combinedInstruction += '\n\nApply these principles naturally in conversation - do NOT be obvious or heavy-handed.';

    return combinedInstruction;
  }

  /**
   * Emit psychology instruction to InjectionQueue
   *
   * This is called when principles are selected by PrincipleDecisionEngine
   * The instruction is queued (not sent directly to Gemini) and will be
   * batched with other injections in the RESPONDING state.
   *
   * @param {Array|string} principles - Principle(s) to apply
   * @param {Object} metadata - Additional context
   */
  emitToQueue(principles, metadata = {}) {
    if (!this.injectionQueue) {
      console.warn('[INJECTOR] No InjectionQueue attached, cannot emit principle');
      return;
    }

    const instruction = this.buildInjectionPrompt(principles);

    if (!instruction) {
      console.warn('[INJECTOR] Empty instruction, not emitting');
      return;
    }

    // Emit as PERSONALITY priority (can be overridden by SYSTEM, but overrides CONTEXT)
    this.injectionQueue.enqueue({
      type: 'PERSONALITY',
      instruction: instruction,
      metadata: {
        principles: Array.isArray(principles) ? principles : [principles],
        ...metadata
      }
    });

    console.log(`[INJECTOR] Emitted principle(s): ${Array.isArray(principles) ? principles.join(' + ') : principles}`);
  }
}

export default PrincipleInjectorService;
