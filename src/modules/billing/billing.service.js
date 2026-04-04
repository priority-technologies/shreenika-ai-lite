'use strict';
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const { Subscription, PLANS } = require('./subscription.model');
const Invoice       = require('./invoice.model');
const MinuteLedger  = require('./minute-ledger.model');

class BillingService {

  // ── Get or create subscription for a user ────────────────────────────────
  static async getOrCreateSubscription(userId) {
    let sub = await Subscription.findOne({ userId });
    if (!sub) {
      sub = await Subscription.create({
        userId,
        plan: 'Starter',
        billingCycle: 'monthly',
        minutesBalance: 0,   // Starter: 0 until they pay
        minutesIncluded: 0,
        status: 'active',
      });
    }
    return sub;
  }

  // ── Get full billing status (for billing page) ────────────────────────────
  static async getBillingStatus(userId) {
    const sub  = await BillingService.getOrCreateSubscription(userId);
    const plan = PLANS[sub.plan] || PLANS.Starter;

    return {
      plan:             sub.plan,
      billingCycle:     sub.billingCycle,
      status:           sub.status,
      minutesBalance:   sub.minutesBalance,
      minutesUsed:      sub.minutesUsed,
      minutesIncluded:  sub.minutesIncluded,
      minutesRemaining: Math.max(0, sub.minutesBalance),
      effectiveLimits:  sub.effectiveLimits,
      addOns:           sub.addOns,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd:   sub.currentPeriodEnd,
      setupFeePaid:     sub.setupFeePaid,
      rechargeAllowed:  plan.rechargeAllowed,
      rechargeRatePerMin: plan.rechargeRatePerMin,
      stripeCustomerId: sub.stripeCustomerId,
    };
  }

  // ── Get usage stats (for graph + dashboard) ───────────────────────────────
  static async getUsageStats(userId) {
    const sub = await BillingService.getOrCreateSubscription(userId);
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"

    // Aggregate minute ledger for last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyBreakdown = await MinuteLedger.aggregate([
      { $match: { userId: sub.userId, createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: '$month',
        geminiMinutes: { $sum: '$geminiMinutes' },
        cacheMinutes:  { $sum: '$cacheMinutes' },
        totalMinutes:  { $sum: '$durationMinutes' },
      }},
      { $sort: { _id: 1 } },
    ]);

    return {
      plan:           sub.plan,
      minutesBalance: sub.minutesBalance,
      minutesUsed:    sub.minutesUsed,
      minutesIncluded: sub.minutesIncluded,
      cacheMinutesUsed: sub.cacheMinutesUsed,
      monthlyBreakdown,
      currentMonth,
    };
  }

  // ── Get invoices ──────────────────────────────────────────────────────────
  static async getInvoices(userId, limit = 12) {
    return Invoice.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  // ── Deduct minutes after a call ends (cost-weighted) ─────────────────────
  //
  // Cost model (INR-based, plan: Starter ₹6.25/min):
  //   Gemini minute → deduct 1.0 minute from balance (full rate)
  //   Cache minute  → deduct 0.04 minute from balance (₹0.25 / ₹6.25 = 4%)
  //
  // Accepts either:
  //   cacheMinutes  (legacy, in minutes)   — old callers
  //   cacheSeconds + geminiSeconds         — new callers (actual measured split)
  //
  static async deductMinutes(userId, { durationSeconds, source, callId, agentId, campaignId,
    cacheMinutes = 0, cacheSeconds = 0, geminiSeconds = 0 }) {

    const sub = await Subscription.findOne({ userId });
    if (!sub) return { success: false, reason: 'No subscription found' };

    const currentMonth    = new Date().toISOString().slice(0, 7);
    const totalSeconds    = durationSeconds || 0;

    // ── Resolve Gemini vs Cache split ───────────────────────────────────────
    let geminiMins, cacheMins;
    if (cacheSeconds > 0 || geminiSeconds > 0) {
      // New path — actual measured split from call
      geminiMins = Math.ceil(geminiSeconds / 60);
      cacheMins  = Math.ceil(cacheSeconds  / 60);
    } else {
      // Legacy path — estimate from cacheMinutes param
      const totalMins = Math.ceil(totalSeconds / 60);
      cacheMins  = Math.min(cacheMinutes, totalMins);
      geminiMins = Math.max(0, totalMins - cacheMins);
    }

    // ── Cost-weighted deduction ──────────────────────────────────────────────
    // Gemini: 1.0 min per minute | Cache: 0.04 min per minute (₹0.25/₹6.25)
    const CACHE_RATE   = 0.04;  // cache minute costs 4% of a Gemini minute
    const weightedDeduction = parseFloat((geminiMins * 1.0 + cacheMins * CACHE_RATE).toFixed(4));

    // ── Deduct from balance ──────────────────────────────────────────────────
    const prevBalance    = sub.minutesBalance;
    const actualDeducted = Math.min(prevBalance, weightedDeduction);
    sub.minutesBalance   = Math.max(0, parseFloat((sub.minutesBalance - weightedDeduction).toFixed(4)));
    sub.minutesUsed     += weightedDeduction;
    sub.cacheMinutesUsed = parseFloat(((sub.cacheMinutesUsed || 0) + cacheMins).toFixed(4));
    await sub.save();

    // ── Write ledger entry ───────────────────────────────────────────────────
    await MinuteLedger.create({
      userId,
      source,
      callId,
      agentId,
      campaignId,
      durationSeconds: totalSeconds,
      durationMinutes: Math.ceil(totalSeconds / 60),
      geminiMinutes:   geminiMins,
      cacheMinutes:    cacheMins,
      weightedDeduction,
      month:           currentMonth,
      minutesDeducted: actualDeducted,
    });

    return {
      success: true,
      geminiMinutes:    geminiMins,
      cacheMinutes:     cacheMins,
      weightedDeduction,
      minutesRemaining: sub.minutesBalance,
    };
  }

  // ── Check if user has enough minutes ─────────────────────────────────────
  static async hasMinutes(userId) {
    const sub = await Subscription.findOne({ userId });
    if (!sub) return false;
    return sub.minutesBalance > 0;
  }

  // ── Check plan limits for agents ─────────────────────────────────────────
  static async checkAgentLimit(userId, currentAgentCount) {
    const sub = await BillingService.getOrCreateSubscription(userId);
    const limit = sub.effectiveLimits.agents;
    return {
      allowed: currentAgentCount < limit,
      current: currentAgentCount,
      limit,
      plan: sub.plan,
    };
  }

  // ── Check plan limits for docs ────────────────────────────────────────────
  static async checkDocLimit(userId, currentDocCount) {
    const sub = await BillingService.getOrCreateSubscription(userId);
    const plan = PLANS[sub.plan];
    if (!plan.docLimit) {
      return { allowed: false, reason: 'Knowledge Base not available on Starter plan', plan: sub.plan };
    }
    const limit = sub.effectiveLimits.docs;
    return {
      allowed: currentDocCount < limit,
      current: currentDocCount,
      limit,
      plan: sub.plan,
    };
  }

  // ── Create Stripe customer ────────────────────────────────────────────────
  static async ensureStripeCustomer(userId, email, name) {
    const sub = await BillingService.getOrCreateSubscription(userId);
    if (sub.stripeCustomerId) return sub.stripeCustomerId;

    const customer = await stripe.customers.create({ email, name, metadata: { userId: userId.toString() } });
    sub.stripeCustomerId = customer.id;
    await sub.save();
    return customer.id;
  }

  // ── Create Stripe checkout session for plan subscription ─────────────────
  static async createCheckoutSession(userId, email, name, { plan, billingCycle, frontendUrl }) {
    const planConfig = PLANS[plan];
    if (!planConfig) throw new Error('Invalid plan: ' + plan);

    const customerId = await BillingService.ensureStripeCustomer(userId, email, name);

    // Use real Stripe Price IDs — no price_data needed
    const stripePriceId = billingCycle === 'yearly'
      ? planConfig.stripePriceYearly
      : planConfig.stripePriceMonthly;

    if (!stripePriceId) throw new Error(`No Stripe price ID configured for ${plan} ${billingCycle}`);

    // Build line items using real Stripe Price IDs
    const lineItems = [{ price: stripePriceId, quantity: 1 }];

    // Add OTC setup fee if Pro or Enterprise and not yet paid
    const sub = await Subscription.findOne({ userId });
    if (planConfig.setupFee > 0 && planConfig.stripeSetupFeePrice && !sub?.setupFeePaid) {
      lineItems.push({ price: planConfig.stripeSetupFeePrice, quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items:           lineItems,
      success_url: `${frontendUrl}/billing?success=1&plan=${plan}`,
      cancel_url:  `${frontendUrl}/billing?cancelled=1`,
      metadata: { userId: userId.toString(), plan, billingCycle },
    });

    return { sessionId: session.id, url: session.url };
  }

  // ── Create Stripe payment intent for minute recharge ─────────────────────
  static async createRechargeIntent(userId, email, name, { minutes }) {
    const sub = await BillingService.getOrCreateSubscription(userId);
    const plan = PLANS[sub.plan];

    if (!plan.rechargeAllowed) {
      throw new Error('Minute recharge not available on Starter plan. Please upgrade to Pro or Enterprise.');
    }

    const amountINR  = Math.ceil(minutes * plan.rechargeRatePerMin);
    const amountPaise = amountINR * 100;
    const customerId = await BillingService.ensureStripeCustomer(userId, email, name);

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountPaise,
      currency: 'inr',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId:  userId.toString(),
        type:    'minute_recharge',
        minutes: minutes.toString(),
        plan:    sub.plan,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      amountINR,
      minutes,
      ratePerMin: plan.rechargeRatePerMin,
    };
  }

  // ── Handle Stripe webhook ─────────────────────────────────────────────────
  static async handleWebhook(rawBody, signature) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      throw new Error('Webhook signature verification failed: ' + err.message);
    }

    switch (event.type) {

      // ── Subscription created/updated ──
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object;
        const userId    = stripeSub.metadata?.userId;
        if (!userId) break;

        const planName  = stripeSub.metadata?.plan || 'Starter';
        const cycle     = stripeSub.metadata?.billingCycle || 'monthly';
        const planConfig = PLANS[planName] || PLANS.Starter;
        const currentMonth = new Date().toISOString().slice(0, 7);

        await Subscription.findOneAndUpdate(
          { userId },
          {
            plan:                 planName,
            billingCycle:         cycle,
            status:               stripeSub.status === 'active' ? 'active' : 'past_due',
            stripeSubscriptionId: stripeSub.id,
            minutesBalance:       planConfig.includedMinutes,
            minutesIncluded:      planConfig.includedMinutes,
            minutesUsed:          0,
            currentPeriodStart:   new Date(stripeSub.current_period_start * 1000),
            currentPeriodEnd:     new Date(stripeSub.current_period_end   * 1000),
            setupFeePaid:         true,
          },
          { upsert: true, new: true }
        );
        break;
      }

      // ── Payment succeeded (minute recharge) ──
      case 'payment_intent.succeeded': {
        const pi     = event.data.object;
        const userId = pi.metadata?.userId;
        const type   = pi.metadata?.type;
        const minutes = parseInt(pi.metadata?.minutes || '0', 10);

        if (userId && type === 'minute_recharge' && minutes > 0) {
          await Subscription.findOneAndUpdate(
            { userId },
            {
              $inc: {
                minutesBalance:  minutes,
                minutesRecharged: minutes,
                'addOns.extraMinutes': Math.floor(minutes / 100),
              }
            }
          );

          // Log recharge in invoice
          const currentMonth = new Date().toISOString().slice(0, 7);
          const sub = await Subscription.findOne({ userId });
          const plan = PLANS[sub?.plan] || PLANS.Pro;
          const amountINR = Math.ceil(minutes * plan.rechargeRatePerMin);

          await Invoice.findOneAndUpdate(
            { userId, month: currentMonth, status: 'draft' },
            {
              $push: {
                lineItems: {
                  description: `${minutes} minute recharge`,
                  quantity:    minutes,
                  unitPrice:   plan.rechargeRatePerMin,
                  total:       amountINR,
                  type:        'recharge',
                }
              },
              $inc: { subtotal: amountINR, total: amountINR },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
        break;
      }

      // ── Subscription cancelled ──
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const userId    = stripeSub.metadata?.userId;
        if (userId) {
          await Subscription.findOneAndUpdate({ userId }, { status: 'cancelled', minutesBalance: 0 });
        }
        break;
      }

      // ── Invoice paid (monthly renewal) ──
      case 'invoice.paid': {
        const inv    = event.data.object;
        const userId = inv.subscription_details?.metadata?.userId;
        if (!userId) break;

        const sub = await Subscription.findOne({ userId });
        if (!sub) break;

        const plan        = PLANS[sub.plan] || PLANS.Starter;
        const currentMonth = new Date().toISOString().slice(0, 7);

        // Reset minutes on renewal
        sub.minutesBalance  = plan.includedMinutes;
        sub.minutesIncluded = plan.includedMinutes;
        sub.minutesUsed     = 0;
        sub.cacheMinutesUsed = 0;
        await sub.save();

        // Create invoice record
        const subtotal = plan.monthlyPrice;
        await Invoice.create({
          userId,
          month:       currentMonth,
          periodStart: new Date(inv.period_start * 1000),
          periodEnd:   new Date(inv.period_end   * 1000),
          lineItems: [{
            description: `${sub.plan} Plan — ${sub.billingCycle} subscription`,
            quantity:    1,
            unitPrice:   subtotal,
            total:       subtotal,
            type:        'subscription',
          }],
          subtotal,
          gst:   Math.round(subtotal * 0.18),
          total: Math.round(subtotal * 1.18),
          status:           'paid',
          stripeInvoiceId:  inv.id,
          paidAt:           new Date(),
          plan:             sub.plan,
          billingCycle:     sub.billingCycle,
        });
        break;
      }
    }

    return { received: true };
  }
}

module.exports = BillingService;
