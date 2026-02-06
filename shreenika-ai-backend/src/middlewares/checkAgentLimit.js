import Subscription from "../modules/billing/subscription.model.js";
import Agent from "../modules/agent/agent.model.js";

/**
 * Middleware to check if user has reached agent creation limit
 * Enforces plan-based agent limits
 */
export const checkAgentLimit = async (req, res, next) => {
  try {
    // Get user's subscription
    const subscription = await Subscription.findOne({ userId: req.user._id });

    if (!subscription) {
      return res.status(404).json({
        error: "Subscription not found",
        message: "Please contact support"
      });
    }

    // Count current agents
    const currentAgentCount = await Agent.countDocuments({
      userId: req.user._id
    });

    // Check if limit is reached
    if (currentAgentCount >= subscription.agentLimit) {
      return res.status(403).json({
        error: "Agent limit reached",
        message: `You have reached the maximum number of agents (${subscription.agentLimit}) for your ${subscription.plan} plan.`,
        details: {
          current: currentAgentCount,
          limit: subscription.agentLimit,
          plan: subscription.plan
        }
      });
    }

    // Allow creation
    next();
  } catch (error) {
    console.error("CHECK_AGENT_LIMIT ERROR:", error);
    return res.status(500).json({
      error: "Failed to check agent limit",
      message: error.message
    });
  }
};

/**
 * Middleware to check if user can upload documents
 * Enforces plan-based document limits
 */
export const checkDocumentLimit = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user._id });

    if (!subscription) {
      return res.status(404).json({
        error: "Subscription not found"
      });
    }

    // Check if knowledge base is enabled for this plan
    if (!subscription.knowledgeBaseEnabled) {
      return res.status(403).json({
        error: "Knowledge base not available",
        message: `Knowledge base is not available on the ${subscription.plan} plan. Please upgrade to Pro or Enterprise.`,
        plan: subscription.plan
      });
    }

    // TODO: Implement document count check when document tracking is added
    // For now, just check if feature is enabled

    next();
  } catch (error) {
    console.error("CHECK_DOCUMENT_LIMIT ERROR:", error);
    return res.status(500).json({
      error: "Failed to check document limit",
      message: error.message
    });
  }
};
