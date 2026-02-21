/**
 * System Prompt Injector
 *
 * Dynamically injects psychological principles and conversation context
 * into Gemini's system prompt to guide response generation.
 *
 * The injected prompt ensures Gemini:
 * 1. Uses the selected psychological principle in all responses
 * 2. Respects conversation stage and client profile
 * 3. Addresses any detected objections
 * 4. Maintains language and cultural consistency
 * 5. Applies appropriate tone and speaking style
 */

export class SystemPromptInjector {
  /**
   * Inject principle and conversation context into base system prompt
   *
   * @param {String} baseSystemPrompt - Original system prompt
   * @param {Object} principleDecision - From PrincipleDecisionEngine.decidePrinciple()
   * @param {Object} conversationContext - From ConversationAnalyzer.getConversationContext()
   * @param {Object} agentConfig - Agent's voice and personality config
   * @returns {String} - Enhanced system prompt with principle injection
   */
  injectPrinciple(baseSystemPrompt, principleDecision, conversationContext, agentConfig = {}) {
    const {
      primary: primaryPrinciple,
      secondary: secondaryPrinciple,
      instructions,
      voiceGuidance,
      tactics,
      priority
    } = principleDecision;

    const {
      stage,
      clientProfile,
      objections = [],
      messageCount = 0,
      conversationDuration = 0
    } = conversationContext;

    // Build principle-specific guidance
    const principleGuidance = this._buildPrincipleGuidance(
      primaryPrinciple,
      secondaryPrinciple,
      instructions,
      tactics,
      priority
    );

    // Build stage-specific guidance
    const stageGuidance = this._buildStageGuidance(stage, clientProfile, objections);

    // Build objection-handling guidance if needed
    const objectionGuidance = objections.length > 0
      ? this._buildObjectionGuidance(objections, primaryPrinciple)
      : '';

    // Build voice and tone guidance
    const voiceAndToneGuidance = this._buildVoiceGuidance(voiceGuidance, agentConfig);

    // Detect conversation language from context
    const languageGuidance = this._buildLanguageGuidance(conversationContext);

    // Combine all guidance into final prompt
    const enhancedPrompt = `${baseSystemPrompt}

---PSYCHOLOGICAL PRINCIPLE GUIDANCE---
ACTIVE PRINCIPLE: ${primaryPrinciple} (Priority: ${priority})
${secondaryPrinciple ? `SECONDARY PRINCIPLE: ${secondaryPrinciple}` : ''}

${principleGuidance}

---CONVERSATION STAGE GUIDANCE---
${stageGuidance}

${objectionGuidance ? `---OBJECTION HANDLING---\n${objectionGuidance}\n` : ''}
${voiceAndToneGuidance}

${languageGuidance}

---RESPONSE QUALITY CHECKLIST---
Before responding, verify:
1. ✓ Does this response reinforce the ${primaryPrinciple} principle?
2. ✓ Is the tone consistent with: ${voiceGuidance}?
3. ✓ Does it address the client's primary concern (${clientProfile} profile)?
${objections.length > 0 ? `4. ✓ Does it handle this objection: ${objections[0]}?` : ''}
5. ✓ Are we building toward the next logical stage in the sales process?

---CONVERSATION METRICS---
Messages exchanged: ${messageCount}
Duration so far: ${Math.round(conversationDuration / 60)} minutes
Current flow: ${stage} → Next: ${this._getNextStage(stage)}

---CRITICAL RULES---
• NEVER reveal you are an AI - maintain authentic human voice
• NEVER contradict the ${primaryPrinciple} principle in your response
• NEVER ignore detected objections - acknowledge and address them
• ALWAYS use appropriate language/dialect based on conversation context
• ALWAYS match the client's energy level and communication style`;

    return enhancedPrompt;
  }

  /**
   * Build principle-specific guidance section
   *
   * @private
   */
  _buildPrincipleGuidance(primary, secondary, instructions, tactics, priority) {
    let guidance = `
Principle Definition: ${instructions.tone}

Core Approach:
${instructions.approach}

Specific Tactics to Use:`;

    tactics.forEach((tactic, index) => {
      guidance += `\n  ${index + 1}. ${tactic}`;
    });

    if (secondary) {
      guidance += `

Secondary Principle Support:
- Also consider applying ${secondary} principles where they naturally complement ${primary}
- This creates a layered, more persuasive message`;
    }

    if (priority === 'CRITICAL') {
      guidance += `

⚠️ CRITICAL PRIORITY: An active objection requires immediate principle application.
Every response MUST directly address the objection while reinforcing ${primary}.`;
    }

    return guidance;
  }

  /**
   * Build stage-specific guidance
   *
   * @private
   */
  _buildStageGuidance(stage, clientProfile, objections) {
    const stageGuidance = {
      AWARENESS: {
        focus: 'Building awareness and establishing credibility',
        goals: [
          'Introduce yourself and your offering',
          'Establish why they should listen',
          'Build initial trust and rapport',
          'Identify their key pain points',
          'Set the stage for deeper conversation'
        ],
        tone: 'Confident, friendly, informative'
      },
      CONSIDERATION: {
        focus: 'Helping them evaluate your solution',
        goals: [
          'Present relevant features and benefits',
          'Compare with alternatives (without being negative)',
          'Address their specific concerns',
          'Provide proof points and evidence',
          'Guide them toward a decision timeline'
        ],
        tone: 'Analytical, supportive, consultative'
      },
      DECISION: {
        focus: 'Moving them toward commitment',
        goals: [
          'Reference their stated needs and priorities',
          'Highlight what they\'ll gain',
          'Address any final objections',
          'Create a sense of urgency',
          'Make commitment feel natural and logical'
        ],
        tone: 'Confident, encouraging, action-oriented'
      }
    };

    const current = stageGuidance[stage] || stageGuidance.AWARENESS;
    let guidance = `
Current Stage: ${stage}
Focus: ${current.focus}
Tone to Use: ${current.tone}

Goals for this stage:`;

    current.goals.forEach((goal) => {
      guidance += `\n• ${goal}`;
    });

    guidance += `

Client Profile: ${clientProfile}
- Tailor your explanation to resonate with their thinking style`;

    return guidance;
  }

  /**
   * Build objection-handling guidance
   *
   * @private
   */
  _buildObjectionGuidance(objections, primaryPrinciple) {
    const objectionStrategies = {
      PRICE: {
        acknowledge: 'Acknowledge the price concern is valid',
        strategy: 'Reframe value using ANCHORING principle - compare to alternatives, ROI, long-term savings',
        response: 'Rather than directly arguing price, show the cost of NOT solving their problem'
      },
      QUALITY: {
        acknowledge: 'Validate their concern about quality',
        strategy: 'Use AUTHORITY principle - provide proof through case studies, testimonials, certifications',
        response: 'Demonstrate how your solution outlasts and outperforms alternatives'
      },
      TRUST: {
        acknowledge: 'Recognize trust takes time to build',
        strategy: 'Use AUTHORITY and COMMITMENT - share credentials, success stories, guarantees',
        response: 'Give them reasons to trust through proven track record and your personal investment'
      },
      TIMING: {
        acknowledge: 'Respect that timing matters',
        strategy: 'Use SCARCITY and COMMITMENT - show what they\'ll miss, create deadline',
        response: 'Help them see why now is the best time to act'
      },
      NEED: {
        acknowledge: 'Clarify whether they don\'t see the need yet',
        strategy: 'Use RECIPROCITY and COMMITMENT - provide value first, reference their goals',
        response: 'Help them discover the need themselves through questions and evidence'
      }
    };

    let guidance = '';
    objections.forEach((objection) => {
      if (objectionStrategies[objection]) {
        const strategy = objectionStrategies[objection];
        guidance += `
Objection: ${objection}
→ ${strategy.acknowledge}
→ ${strategy.strategy}
→ ${strategy.response}
`;
      }
    });

    guidance += `
Remember: Address objections directly without being defensive.
Use the ${primaryPrinciple} principle to frame your response positively.`;

    return guidance;
  }

  /**
   * Build voice and tone guidance
   *
   * @private
   */
  _buildVoiceGuidance(voiceGuidance, agentConfig) {
    let guidance = `VOICE & TONE GUIDANCE:
• Speaking Style: ${voiceGuidance}`;

    if (agentConfig.characteristics) {
      guidance += `
• Agent Characteristics: ${Object.entries(agentConfig.characteristics)
        .filter(([_, value]) => value)
        .map(([key]) => key)
        .join(', ') || 'Professional'}`;
    }

    if (agentConfig.emotionLevel !== undefined) {
      const emotionMap = {
        0.2: 'calm and measured',
        0.5: 'balanced and professional',
        0.7: 'enthusiastic and energetic',
        0.9: 'highly excited and animated'
      };
      const closestEmotion = Object.keys(emotionMap).reduce((prev, curr) =>
        Math.abs(curr - agentConfig.emotionLevel) < Math.abs(prev - agentConfig.emotionLevel) ? curr : prev
      );
      guidance += `
• Emotion Level: ${emotionMap[closestEmotion]} (${(agentConfig.emotionLevel * 100).toFixed(0)}%)`;
    }

    if (agentConfig.voiceSpeed) {
      guidance += `
• Speaking Speed: ${agentConfig.voiceSpeed < 1 ? 'Slower, more deliberate' : 'Faster, more energetic'} (${(agentConfig.voiceSpeed * 100).toFixed(0)}%)`;
    }

    return guidance;
  }

  /**
   * Build language-specific guidance to prevent cross-language contamination
   *
   * @private
   */
  _buildLanguageGuidance(conversationContext) {
    // Detect language from conversation history if available
    let detectedLanguage = 'English'; // Default

    if (conversationContext.discussedTopics) {
      // Check for language indicators in topics
      if (Array.isArray(conversationContext.discussedTopics)) {
        const hindiIndicators = ['₹', 'hindi', 'marathi', 'gujarati', 'bengali', 'tamil', 'telugu', 'kannada', 'malayalam'];
        conversationContext.discussedTopics.forEach(topic => {
          if (typeof topic === 'string') {
            const lower = topic.toLowerCase();
            if (hindiIndicators.some(indicator => lower.includes(indicator))) {
              detectedLanguage = 'Hinglish (Hindi-English mix)';
            }
          }
        });
      }
    }

    return `LANGUAGE & CULTURAL CONSISTENCY:
• Primary Language: ${detectedLanguage}
• Critical: If conversation started in Hinglish/Hindi, ALWAYS maintain that language
• NEVER mix unrelated languages or cultural contexts
• Examples to AVOID: Discussing in Marathi but using French filler phrases
• Audio fillers MUST match the conversation language
• Cultural sensitivity: Respect local customs and values in examples`;
  }

  /**
   * Determine the next likely stage
   *
   * @private
   */
  _getNextStage(currentStage) {
    const progression = {
      AWARENESS: 'CONSIDERATION (help them evaluate options)',
      CONSIDERATION: 'DECISION (move toward commitment)',
      DECISION: 'CLOSING (finalize and next steps)'
    };
    return progression[currentStage] || 'Next conversation';
  }

  /**
   * Strip principle guidance from response (for logging/analysis)
   *
   * @param {String} enhancedPrompt - Full enhanced prompt
   * @returns {String} - Just the original base prompt
   */
  extractBasePrompt(enhancedPrompt) {
    const split = enhancedPrompt.split('---PSYCHOLOGICAL PRINCIPLE GUIDANCE---');
    return split[0].trim();
  }

  /**
   * Extract principle section from prompt for analysis
   *
   * @param {String} enhancedPrompt - Full enhanced prompt
   * @returns {String} - Just the principle guidance section
   */
  extractPrincipleGuidance(enhancedPrompt) {
    const match = enhancedPrompt.match(/---PSYCHOLOGICAL PRINCIPLE GUIDANCE---([\s\S]*?)---CONVERSATION STAGE GUIDANCE---/);
    return match ? match[1].trim() : '';
  }
}

// Export singleton
export const systemPromptInjector = new SystemPromptInjector();
