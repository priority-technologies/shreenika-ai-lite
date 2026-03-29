'use strict';
const mongoose = require('mongoose');

// ── Plan definitions — single source of truth ──────────────────────────────
const PLANS = {
  Starter: {
    monthlyPrice:       2499,   // INR
    yearlyPrice:        1999,   // INR per month (billed annually)
    setupFee:           0,
    includedMinutes:    400,
    agentLimit:         1,
    docLimit:           0,      // No KB on Starter
    rechargeAllowed:    false,
    rechargeRatePerMin: null,
    // Stripe Price IDs
    stripePriceMonthly: 'price_1TFdn4DWexfBYL7QdpAQUUOj',
    stripePriceYearly:  'price_1TFdn4DWexfBYL7QvD19nqrk',
    stripeSetupFeePrice: null,
  },
  Pro: {
    monthlyPrice:       7999,
    yearlyPrice:        6399,
    setupFee:           4999,
    includedMinutes:    1500,
    agentLimit:         5,
    docLimit:           25,     // 5 docs per agent
    rechargeAllowed:    true,
    rechargeRatePerMin: 5.50,   // INR per minute
    // Stripe Price IDs
    stripePriceMonthly: 'price_1TFdtwDWexfBYL7QczaduFpZ',
    stripePriceYearly:  'price_1TFdtwDWexfBYL7QlYaOV4VL',
    stripeSetupFeePrice: 'price_1TFeUdDWexfBYL7Qoq6CS7Oh',
  },
  Enterprise: {
    monthlyPrice:       19999,
    yearlyPrice:        15999,
    setupFee:           14999,
    includedMinutes:    5000,
    agentLimit:         99,
    docLimit:           990,    // 10 docs per agent
    rechargeAllowed:    true,
    rechargeRatePerMin: 3.99,
    // Stripe Price IDs
    stripePriceMonthly: 'price_1TFeQ5DWexfBYL7QVsH9moyj',
    stripePriceYearly:  'price_1TFeQ5DWexfBYL7QisLczbRp',
    stripeSetupFeePrice: 'price_1TFeX0DWexfBYL7QzlPWGgTw',
  },
};

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },

  // Current plan
  plan: {
    type: String,
    enum: ['Starter', 'Pro', 'Enterprise'],
    default: 'Starter',
  },

  // Billing cycle
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly',
  },

  // Subscription status
  status: {
    type: String,
    enum: ['active', 'past_due', 'cancelled', 'trialing'],
    default: 'active',
  },

  // Minutes balance — deducted per call minute
  minutesBalance: {
    type: Number,
    default: 0,
  },

  // Minutes included in current billing cycle (reset on renewal)
  minutesIncluded: {
    type: Number,
    default: 0,
  },

  // Minutes used this cycle
  minutesUsed: {
    type: Number,
    default: 0,
  },

  // Minutes from recharge purchases (tracked separately for billing graph)
  minutesRecharged: {
    type: Number,
    default: 0,
  },

  // Cache minutes (served from cache, lower cost) — tracked for graph
  cacheMinutesUsed: {
    type: Number,
    default: 0,
  },

  // Stripe IDs
  stripeCustomerId:     { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },
  stripePaymentMethodId:{ type: String, default: null },

  // Billing dates
  currentPeriodStart: { type: Date, default: Date.now },
  currentPeriodEnd:   { type: Date, default: () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  }},

  // Setup fee paid (one-time)
  setupFeePaid: { type: Boolean, default: false },

  // Add-ons (Pro only)
  addOns: {
    extraDocs:    { type: Number, default: 0 },  // batches of 10 docs
    extraAgents:  { type: Number, default: 0 },  // extra agent slots (max 2)
    extraMinutes: { type: Number, default: 0 },  // batches of 100 mins purchased
  },

}, { timestamps: true });

// ── Virtual: effective limits (plan + add-ons) ─────────────────────────────
subscriptionSchema.virtual('effectiveLimits').get(function () {
  const plan = PLANS[this.plan] || PLANS.Starter;
  return {
    agents:  plan.agentLimit + (this.addOns.extraAgents || 0),
    docs:    plan.docLimit   + (this.addOns.extraDocs   || 0) * 10,
    minutes: plan.includedMinutes,
  };
});

subscriptionSchema.set('toJSON', { virtuals: true });
subscriptionSchema.set('toObject', { virtuals: true });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = { Subscription, PLANS };
