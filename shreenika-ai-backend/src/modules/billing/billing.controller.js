import Subscription from "./subscription.model.js";
import Usage from "../usage/usage.model.js";
import Invoice from "./invoice.model.js";
import AddOn from "./addon.model.js";
import Agent from "../agent/agent.model.js";
import stripe from "./stripe.client.js";
import { PLAN_LIMITS, ADD_ON_PRICING, canPurchaseAddOn } from "./plans.config.js";

const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const getBillingStatus = async (req, res) => {
  try {
    let sub = await Subscription.findOne({ userId: req.user._id });

    // ✅ AUTO-CREATE SUBSCRIPTION IF MISSING (Safety net)
    if (!sub) {
      console.log(`⚠️ No subscription found for user ${req.user._id}, creating default...`);

      sub = await Subscription.create({
        userId: req.user._id,
        plan: 'Starter',
        status: 'ACTIVE',
        agentLimit: 1,
        docLimit: 0,
        knowledgeBaseEnabled: false,
        addOnsEnabled: false,
        activationFeePaid: true,
        activationFeeAmount: 0,
      });

      console.log('✅ Default subscription created');
    }

    res.json(sub);
  } catch (err) {
    console.error("❌ getBillingStatus error:", err);
    res.status(500).json({ error: "Failed to fetch billing status" });
  }
};

/**
 * CRITICAL MIDDLEWARE: Enforce usage limits
 * 
 * RUNS AFTER requireAuth (so req.user exists)
 * 
 * Future optimization points:
 * - Add Redis caching for subscription lookups
 * - Implement soft limits with warnings
 * - Add grace period for premium users
 */
export const enforceUsageLimits = async (req, res, next) => {
  try {
    // FIXED: Use req.user._id (not req.user.id)
    const userId = req.user._id || req.user.id;
    
    if (!userId) {
      console.error("❌ enforceUsageLimits: No user ID found");
      return res.status(401).json({ error: "Authentication required" });
    }

    const sub = await Subscription.findOne({ userId });
    const month = getMonthKey();

    // Free tier - no limits (for now)
    if (!sub || sub.plan === "FREE") {
      return next();
    }

    // Check account status
    if (sub.status !== "ACTIVE") {
      return res.status(402).json({
        error: "Account not active",
        status: sub.status,
        plan: sub.plan
      });
    }

    // Check usage
    const usage = await Usage.findOne({ userId, month });

    if (!usage) {
      // No usage yet this month - allow request
      return next();
    }

    // Hard stop check
    if (usage.hardStopped) {
      return res.status(402).json({
        error: "Usage hard stopped",
        reason: "Monthly limit exceeded",
        resetDate: getNextMonthDate()
      });
    }

    // Voice minutes limit
    if (
      sub.monthlyMinuteLimit &&
      usage.voiceMinutesUsed >= sub.monthlyMinuteLimit
    ) {
      await Usage.updateOne(
        { userId, month },
        { hardStopped: true, stoppedAt: new Date() }
      );
      
      return res.status(402).json({
        error: "Voice limit exceeded",
        used: usage.voiceMinutesUsed,
        limit: sub.monthlyMinuteLimit,
        resetDate: getNextMonthDate()
      });
    }

    // LLM token limit
    if (
      sub.monthlyTokenLimit &&
      usage.llmTokensUsed >= sub.monthlyTokenLimit
    ) {
      await Usage.updateOne(
        { userId, month },
        { hardStopped: true, stoppedAt: new Date() }
      );
      
      return res.status(402).json({
        error: "Token limit exceeded",
        used: usage.llmTokensUsed,
        limit: sub.monthlyTokenLimit,
        resetDate: getNextMonthDate()
      });
    }

    // All checks passed - proceed
    next();
    
  } catch (err) {
    console.error("❌ enforceUsageLimits error:", err);
    
    // CRITICAL: Never block requests due to enforcement errors
    // Log the error and allow the request (fail open, not closed)
    next();
  }
};

/**
 * Helper: Get first day of next month
 */
function getNextMonthDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

/**
 * Get current usage for authenticated user
 * UPDATED: Now includes agent count and document count
 */
export const getCurrentUsage = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const month = getMonthKey();

    const [usage, sub, agentCount] = await Promise.all([
      Usage.findOne({ userId, month }),
      Subscription.findOne({ userId }),
      Agent.countDocuments({ userId })
    ]);

    // TODO: Add document count when document tracking is implemented
    const docCount = 0;

    res.json({
      voiceMinutes: usage?.voiceMinutesUsed || 0,
      llmTokens: usage?.llmTokensUsed || 0,
      agentCount,
      docCount,
      limits: {
        agents: sub?.agentLimit || 1,
        docs: sub?.docLimit || 0,
        voiceMinutes: sub?.monthlyMinuteLimit || null,
        llmTokens: sub?.monthlyTokenLimit || null
      },
      plan: sub?.plan || "Starter",
      hardStopped: usage?.hardStopped || false
    });

  } catch (err) {
    console.error("❌ getCurrentUsage error:", err);
    res.status(500).json({ error: "Failed to fetch usage" });
  }
};
/**
 * Get invoice history for authenticated user
 * Returns last 12 months of invoices
 */
export const getInvoices = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const invoices = await Invoice.find({ userId })
      .sort({ month: -1 })
      .limit(12);

    res.json(invoices);
  } catch (err) {
    console.error("❌ getInvoices error:", err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
};

/**
 * Purchase an add-on
 * Validates plan eligibility and updates subscription limits
 */
export const purchaseAddOn = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { type, quantity } = req.body;

    if (!type || !quantity) {
      return res.status(400).json({ error: "type and quantity are required" });
    }

    // Get user subscription (with auto-create safety net)
    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      console.log(`⚠️ No subscription found during add-on purchase, creating default...`);

      subscription = await Subscription.create({
        userId,
        plan: 'Starter',
        status: 'ACTIVE',
        agentLimit: 1,
        docLimit: 0,
        knowledgeBaseEnabled: false,
        addOnsEnabled: false,
        activationFeePaid: true,
        activationFeeAmount: 0,
      });

      console.log('✅ Default subscription created');
    }

    // Validate add-on availability for plan
    if (!canPurchaseAddOn(type, subscription.plan)) {
      return res.status(403).json({
        error: "Add-on not available",
        message: `The ${type} add-on is not available for your ${subscription.plan} plan`
      });
    }

    const addOnConfig = ADD_ON_PRICING[type];

    // Check max limit for extra_agent
    if (type === "extra_agent") {
      const addOns = await AddOn.getUserAddOns(userId);
      const existingAgentAddOns = addOns?.getAddOnCountByType("extra_agent") || 0;

      if (existingAgentAddOns + quantity > addOnConfig.max) {
        return res.status(403).json({
          error: "Maximum add-on limit reached",
          message: `You can only purchase up to ${addOnConfig.max} extra agent slots`,
          current: existingAgentAddOns,
          max: addOnConfig.max
        });
      }
    }

    // Calculate cost
    const totalCost = addOnConfig.cost * quantity;

    // TODO: Create Stripe payment session
    // For now, we'll just create the add-on record

    // Create add-on record
    await AddOn.addAddOn(
      userId,
      subscription.plan,
      type,
      quantity,
      totalCost,
      null // stripePaymentIntentId
    );

    // Update subscription limits
    if (type === "extra_agent") {
      subscription.agentLimit += quantity;
    } else if (type === "extra_documents") {
      subscription.docLimit += addOnConfig.quantity * quantity;
    }

    await subscription.save();

    res.json({
      success: true,
      message: "Add-on purchased successfully",
      addOn: {
        type,
        quantity,
        cost: totalCost
      },
      newLimits: {
        agents: subscription.agentLimit,
        docs: subscription.docLimit
      }
    });
  } catch (err) {
    console.error("❌ purchaseAddOn error:", err);
    res.status(500).json({ error: "Failed to purchase add-on" });
  }
};

/**
 * Update subscription plan
 * Handles upgrade/downgrade with validation
 */
export const updatePlan = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { newPlan } = req.body;

    if (!newPlan || !["Starter", "Pro", "Enterprise"].includes(newPlan)) {
      return res.status(400).json({
        error: "Invalid plan",
        validPlans: ["Starter", "Pro", "Enterprise"]
      });
    }

    let subscription = await Subscription.findOne({ userId });

    // ✅ AUTO-CREATE SUBSCRIPTION IF MISSING (Safety net)
    if (!subscription) {
      console.log(`⚠️ No subscription found during plan update, creating with ${newPlan} plan...`);

      subscription = await Subscription.create({
        userId,
        plan: newPlan,
        status: 'ACTIVE',
        agentLimit: PLAN_LIMITS[newPlan].agentLimit,
        docLimit: PLAN_LIMITS[newPlan].docLimit,
        knowledgeBaseEnabled: PLAN_LIMITS[newPlan].knowledgeBase,
        addOnsEnabled: PLAN_LIMITS[newPlan].addOns,
        activationFeePaid: newPlan === 'Starter', // Starter is free
        activationFeeAmount: PLAN_LIMITS[newPlan].activationFee,
      });

      console.log('✅ Subscription created with plan:', newPlan);

      return res.json({
        success: true,
        message: `Subscription created with ${newPlan} plan`,
        oldPlan: 'None',
        newPlan,
        newLimits: {
          agents: subscription.agentLimit,
          docs: subscription.docLimit,
          knowledgeBase: subscription.knowledgeBaseEnabled,
          addOns: subscription.addOnsEnabled
        }
      });
    }

    const oldPlan = subscription.plan;

    // Check if downgrading
    const isDowngrade =
      (oldPlan === "Enterprise" && newPlan !== "Enterprise") ||
      (oldPlan === "Pro" && newPlan === "Starter");

    const isUpgrade =
      (oldPlan === "Starter" && newPlan !== "Starter") ||
      (oldPlan === "Pro" && newPlan === "Enterprise");

    if (isDowngrade) {
      // Validate downgrade is possible
      const agentCount = await Agent.countDocuments({ userId });
      const newLimits = PLAN_LIMITS[newPlan];

      if (agentCount > newLimits.agentLimit) {
        return res.status(403).json({
          error: "Cannot downgrade",
          message: `You have ${agentCount} agents but ${newPlan} plan only allows ${newLimits.agentLimit}. Please delete some agents first.`,
          current: agentCount,
          newLimit: newLimits.agentLimit
        });
      }

      // Downgrades are immediate (no payment required)
      subscription.plan = newPlan;
      subscription.activationFeeAmount = PLAN_LIMITS[newPlan].activationFee;
      subscription.activationFeePaid = newPlan === 'Starter'; // Starter has no fee
      await subscription.save();

      return res.json({
        success: true,
        message: `Plan downgraded from ${oldPlan} to ${newPlan}`,
        oldPlan,
        newPlan,
        newLimits: {
          agents: subscription.agentLimit,
          docs: subscription.docLimit,
          knowledgeBase: subscription.knowledgeBaseEnabled,
          addOns: subscription.addOnsEnabled
        }
      });
    }

    // ✅ HANDLE UPGRADES WITH STRIPE PAYMENT
    if (isUpgrade) {
      const activationFee = PLAN_LIMITS[newPlan].activationFee;

      // Enterprise plan - requires sales contact
      if (newPlan === 'Enterprise') {
        return res.json({
          requiresContact: true,
          message: 'Enterprise plan requires sales consultation',
          contactEmail: 'sales@shreenika.ai'
        });
      }

      // Pro plan - requires $20 activation fee
      if (newPlan === 'Pro' && !subscription.activationFeePaid) {
        try {
          // Create or get Stripe customer
          let stripeCustomerId = subscription.stripeCustomerId;

          if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
              email: req.user.email,
              metadata: {
                userId: userId.toString(),
                plan: newPlan
              }
            });
            stripeCustomerId = customer.id;
            subscription.stripeCustomerId = stripeCustomerId;
          }

          // Create Stripe checkout session for activation fee
          const session = await stripe.checkout.sessions.create({
            mode: 'payment', // One-time payment
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `${newPlan} Plan Activation`,
                  description: `One-time activation fee for ${newPlan} plan`
                },
                unit_amount: activationFee * 100, // $20 = 2000 cents
              },
              quantity: 1,
            }],
            success_url: `${process.env.FRONTEND_URL}/billing/success?plan=${newPlan}`,
            cancel_url: `${process.env.FRONTEND_URL}/billing`,
            metadata: {
              userId: userId.toString(),
              newPlan,
              oldPlan,
              type: 'activation_fee'
            }
          });

          // Save pending upgrade info
          subscription.pendingPlanUpgrade = newPlan;
          subscription.stripeSessionId = session.id;
          await subscription.save();

          console.log('✅ Stripe checkout session created:', session.id);

          return res.json({
            requiresPayment: true,
            checkoutUrl: session.url,
            sessionId: session.id,
            amount: activationFee,
            message: `Redirecting to payment for ${newPlan} plan activation`
          });
        } catch (stripeErr) {
          console.error('❌ Stripe error:', stripeErr);
          return res.status(500).json({
            error: 'Payment setup failed',
            message: stripeErr.message
          });
        }
      }

      // If activation fee already paid, upgrade immediately
      subscription.plan = newPlan;
      subscription.activationFeeAmount = activationFee;
      await subscription.save();

      return res.json({
        success: true,
        message: `Plan upgraded from ${oldPlan} to ${newPlan}`,
        oldPlan,
        newPlan,
        newLimits: {
          agents: subscription.agentLimit,
          docs: subscription.docLimit,
          knowledgeBase: subscription.knowledgeBaseEnabled,
          addOns: subscription.addOnsEnabled
        }
      });
    }

    // No change in plan
    res.json({
      success: true,
      message: `Already on ${newPlan} plan`,
      oldPlan,
      newPlan,
      newLimits: {
        agents: subscription.agentLimit,
        docs: subscription.docLimit,
        knowledgeBase: subscription.knowledgeBaseEnabled,
        addOns: subscription.addOnsEnabled
      }
    });
  } catch (err) {
    console.error("❌ updatePlan error:", err);
    res.status(500).json({ error: "Failed to update plan" });
  }
};

/**
 * Cancel subscription
 * Sets status to CANCELED
 */
export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const subscription = await Subscription.findOne({ userId });
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    subscription.status = "CANCELED";
    subscription.gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days grace period
    await subscription.save();

    res.json({
      success: true,
      message: "Subscription canceled successfully",
      gracePeriodEndsAt: subscription.gracePeriodEndsAt
    });
  } catch (err) {
    console.error("❌ cancelSubscription error:", err);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
};
