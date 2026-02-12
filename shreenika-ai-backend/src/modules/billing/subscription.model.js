import mongoose from "mongoose";
import { getPlanLimits } from "./plans.config.js";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    stripeCustomerId: String,
    stripeSubscriptionId: String,
    stripePriceId: String,
    stripeSessionId: String, // For tracking checkout sessions
    pendingPlanUpgrade: String, // Plan waiting for payment completion

    plan: {
      type: String,
      enum: ["Starter", "Pro", "Enterprise"],
      default: "Starter"
    },

    status: {
      type: String,
      enum: ["ACTIVE", "PAST_DUE", "CANCELED", "SUSPENDED"],
      default: "ACTIVE"
    },

    currentPeriodStart: Date,
    currentPeriodEnd: Date,

    gracePeriodEndsAt: Date,

    // Plan-based limits
    agentLimit: {
      type: Number,
      default: 1  // Starter default
    },

    docLimit: {
      type: Number,
      default: 0  // Starter default (no docs)
    },

    knowledgeBaseEnabled: {
      type: Boolean,
      default: false  // Starter default
    },

    addOnsEnabled: {
      type: Boolean,
      default: false  // Starter default
    },

    // Activation fee tracking
    activationFeePaid: {
      type: Boolean,
      default: false
    },

    activationFeeAmount: {
      type: Number,
      default: 0
    },

    // Legacy limits (kept for compatibility)
    monthlyMinuteLimit: { type: Number, default: 0 },
    monthlyTokenLimit: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Pre-save hook: Update limits based on plan
subscriptionSchema.pre("save", function (next) {
  console.log(`\n🪝 SUBSCRIPTION PRE-SAVE HOOK:`);
  console.log(`   isModified('plan'): ${this.isModified("plan")}`);
  console.log(`   Current plan: ${this.plan}`);

  if (this.isModified("plan")) {
    console.log(`   ✅ Plan WAS modified - calculating limits...`);
    const limits = getPlanLimits(this.plan);
    console.log(`   Limits from getPlanLimits(${this.plan}):`, limits);

    this.agentLimit = limits.agentLimit;
    this.docLimit = limits.docLimit;
    this.knowledgeBaseEnabled = limits.knowledgeBase;
    this.addOnsEnabled = limits.addOns;
    this.activationFeeAmount = limits.activationFee || 0;

    console.log(`   Updated fields:`);
    console.log(`      agentLimit: ${this.agentLimit}`);
    console.log(`      docLimit: ${this.docLimit}`);
  } else {
    console.log(`   ❌ Plan was NOT modified - skipping limit recalculation`);
  }
  next();
});

// Instance method: Check if agent limit is reached
subscriptionSchema.methods.hasReachedAgentLimit = async function () {
  const Agent = mongoose.model("Agent");
  const count = await Agent.countDocuments({ userId: this.userId });
  return count >= this.agentLimit;
};

// Instance method: Check if doc limit is reached
subscriptionSchema.methods.hasReachedDocLimit = async function () {
  // This will need to be implemented when document tracking is added
  // For now, return false
  return false;
};

export default mongoose.model("Subscription", subscriptionSchema);
