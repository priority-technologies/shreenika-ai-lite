/**
 * VoxAI Plan Configuration
 * Centralized pricing and limits for all subscription plans
 */

export const PLAN_LIMITS = {
  Starter: {
    agentLimit: 1,
    docLimit: 0,
    docsPerAgent: 0,
    knowledgeBase: false,
    addOns: false,
    activationFee: 0
  },
  Pro: {
    agentLimit: 5,
    docLimit: 25,
    docsPerAgent: 5,
    knowledgeBase: true,
    addOns: true,
    activationFee: 20
  },
  Enterprise: {
    agentLimit: Infinity,
    docLimit: Infinity,
    docsPerAgent: Infinity,
    knowledgeBase: true,
    addOns: true,
    activationFee: null // Talk to sales
  }
};

export const ADD_ON_PRICING = {
  extra_documents: {
    cost: 1,           // $1 USD
    quantity: 10,      // 10 documents
    plan: 'Pro',       // Available for Pro plan only
    recurring: false   // One-time purchase
  },
  extra_agent: {
    cost: 20,          // $20 USD per agent
    quantity: 1,       // 1 agent slot
    plan: 'Pro',       // Available for Pro plan only
    max: 2,            // Maximum 2 extra agents allowed
    recurring: false   // One-time purchase
  },
  training_package: {
    cost: 49,          // $49 USD
    quantity: 1,       // 1 package
    plan: 'Enterprise',// Available for Enterprise plan only
    recurring: false   // One-time purchase
  }
};

export const CALL_PRICING = {
  outbound: {
    totalPerMinute: 1.40, // INR (₹1.40)
    currency: 'INR',
    breakdown: {
      llm: 0.56,         // 40% of total
      stt: 0.28,         // 20% of total
      tts: 0.28,         // 20% of total
      infrastructure: 0.28 // 20% of total
    }
  },
  inbound: {
    totalPerMinute: 1.20, // INR (₹1.20)
    currency: 'INR',
    breakdown: {
      llm: 0.48,         // 40% of total
      stt: 0.24,         // 20% of total
      tts: 0.24,         // 20% of total
      infrastructure: 0.00 // 0% (no infra cost for inbound)
    }
  }
};

/**
 * Get plan limits for a specific plan
 * @param {string} planName - Plan name (Starter, Pro, Enterprise)
 * @returns {object} Plan limits
 */
export const getPlanLimits = (planName) => {
  return PLAN_LIMITS[planName] || PLAN_LIMITS.Starter;
};

/**
 * Validate if an add-on can be purchased for a given plan
 * @param {string} addOnType - Type of add-on
 * @param {string} planName - Current plan name
 * @returns {boolean} Whether add-on is allowed
 */
export const canPurchaseAddOn = (addOnType, planName) => {
  const addOn = ADD_ON_PRICING[addOnType];
  if (!addOn) return false;

  const planConfig = PLAN_LIMITS[planName];
  if (!planConfig || !planConfig.addOns) return false;

  return addOn.plan === planName;
};

/**
 * Calculate call cost based on call type and duration
 * @param {string} callType - 'inbound' or 'outbound'
 * @param {number} minutes - Duration in minutes
 * @returns {object} Cost breakdown
 */
export const calculateCallCost = (callType, minutes) => {
  const pricing = CALL_PRICING[callType];
  if (!pricing) throw new Error(`Invalid call type: ${callType}`);

  const totalCost = pricing.totalPerMinute * minutes;

  return {
    total: totalCost,
    currency: pricing.currency,
    breakdown: {
      llm: pricing.breakdown.llm * minutes,
      stt: pricing.breakdown.stt * minutes,
      tts: pricing.breakdown.tts * minutes,
      infrastructure: pricing.breakdown.infrastructure * minutes
    }
  };
};
