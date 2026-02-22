/**
 * Psychology Framework - STEP 5
 * Injects persuasion principles into system prompts
 *
 * Principles:
 * - RECIPROCITY: Give value first
 * - COMMITMENT: Get small agreements
 * - SOCIAL_PROOF: Show others benefit
 * - AUTHORITY: Establish credibility
 * - LIKING: Build rapport
 * - SCARCITY: Create urgency
 */

export const PSYCHOLOGY_PRINCIPLES = {
  RECIPROCITY: 'RECIPROCITY',
  COMMITMENT: 'COMMITMENT',
  SOCIAL_PROOF: 'SOCIAL_PROOF',
  AUTHORITY: 'AUTHORITY',
  LIKING: 'LIKING',
  SCARCITY: 'SCARCITY'
};

export const PRINCIPLE_INSTRUCTIONS = {
  [PSYCHOLOGY_PRINCIPLES.RECIPROCITY]: `
    Apply Reciprocity:
    - Lead with value (offer insights, solve problems first)
    - Mention free resources, trials, or consultations
    - Make the user want to reciprocate with their time/attention
  `,

  [PSYCHOLOGY_PRINCIPLES.COMMITMENT]: `
    Apply Commitment:
    - Use small commitments to build momentum
    - Ask "Can I ask you a quick question?"
    - Get agreement on small points before bigger asks
    - Reference their previous statements
  `,

  [PSYCHOLOGY_PRINCIPLES.SOCIAL_PROOF]: `
    Apply Social Proof:
    - Mention successful customers/case studies
    - Use phrases: "most people", "others have found", "trending"
    - Share specific numbers when possible
    - Reference industry standards or benchmarks
  `,

  [PSYCHOLOGY_PRINCIPLES.AUTHORITY]: `
    Apply Authority:
    - Establish credentials early
    - Reference research, data, certifications
    - Use confident, definitive language
    - Quote industry experts or studies
    - Show years of experience
  `,

  [PSYCHOLOGY_PRINCIPLES.LIKING]: `
    Apply Liking:
    - Find common ground immediately
    - Use their name naturally
    - Compliment their thinking/questions
    - Match their communication style
    - Show genuine interest in their challenges
    - Use warm, conversational tone
  `,

  [PSYCHOLOGY_PRINCIPLES.SCARCITY]: `
    Apply Scarcity:
    - Mention limited availability/slots
    - Reference time-sensitive offers
    - Use phrases: "only available", "limited time", "one of few"
    - Create urgency through exclusivity
    - Don't overuse - only when truthful
  `
};

/**
 * Select primary principle based on agent objective
 */
export function selectPrimaryPrinciple(agentObjective, primaryLanguage) {
  const objective = (agentObjective || '').toLowerCase();

  // Sales-focused
  if (objective.includes('sale') || objective.includes('sell') || objective.includes('close')) {
    return PSYCHOLOGY_PRINCIPLES.RECIPROCITY; // Lead with value
  }

  // Appointment booking
  if (objective.includes('book') || objective.includes('appointment') || objective.includes('meeting')) {
    return PSYCHOLOGY_PRINCIPLES.COMMITMENT; // Get small agreements
  }

  // Lead generation
  if (objective.includes('lead') || objective.includes('prospect')) {
    return PSYCHOLOGY_PRINCIPLES.SOCIAL_PROOF; // Show others benefit
  }

  // Support/service
  if (objective.includes('support') || objective.includes('help') || objective.includes('service')) {
    return PSYCHOLOGY_PRINCIPLES.AUTHORITY; // Establish expertise
  }

  // Default for engagement
  return PSYCHOLOGY_PRINCIPLES.LIKING; // Build rapport
}

/**
 * Inject psychology instruction into system prompt
 */
export function injectPsychologyFramework(systemPrompt, principle) {
  if (!principle || !PRINCIPLE_INSTRUCTIONS[principle]) {
    return systemPrompt;
  }

  const instruction = PRINCIPLE_INSTRUCTIONS[principle];
  return `${systemPrompt}\n\n=== PERSUASION PRINCIPLE ===\n${instruction}\n=== END PRINCIPLE ===`;
}

export default {
  PSYCHOLOGY_PRINCIPLES,
  PRINCIPLE_INSTRUCTIONS,
  selectPrimaryPrinciple,
  injectPsychologyFramework
};
