import stripe from "./stripe.client.js";
import Subscription from "./subscription.model.js";

export const createCheckoutSession = async (req, res) => {
  const { priceId, plan } = req.body;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}/billing/success`,
    cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
    metadata: {
      userId: req.user.id,
      plan
    }
  });

  res.json({ url: session.url });
};

export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  /* CHECKOUT COMPLETED */
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // ✅ Handle activation fee payment (one-time)
    if (session.metadata.type === 'activation_fee') {
      const userId = session.metadata.userId;
      const newPlan = session.metadata.newPlan;

      console.log(`✅ Activation fee paid for user ${userId}, upgrading to ${newPlan}`);

      // ✅ IMPORTANT: Fetch and save to trigger pre-save hook for plan limits
      const subscription = await Subscription.findOne({ userId });
      if (subscription) {
        subscription.stripeCustomerId = session.customer;
        subscription.plan = newPlan;
        subscription.activationFeePaid = true;
        subscription.pendingPlanUpgrade = null;
        subscription.stripeSessionId = null;
        subscription.status = "ACTIVE";
        await subscription.save(); // Triggers pre-save hook!
        console.log(`✅ User ${userId} upgraded to ${newPlan} plan with limits: agentLimit=${subscription.agentLimit}, docLimit=${subscription.docLimit}`);
      }
      return;
    }

    // ✅ Handle subscription payment (recurring)
    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription
      );

      // ✅ IMPORTANT: Fetch and save to trigger pre-save hook for plan limits
      let dbSubscription = await Subscription.findOne({ userId: session.metadata.userId });

      if (!dbSubscription) {
        // Create new subscription if it doesn't exist
        dbSubscription = new Subscription({ userId: session.metadata.userId });
      }

      dbSubscription.stripeCustomerId = session.customer;
      dbSubscription.stripeSubscriptionId = subscription.id;
      dbSubscription.stripePriceId = subscription.items.data[0].price.id;
      dbSubscription.plan = session.metadata.plan;
      dbSubscription.status = "ACTIVE";
      dbSubscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
      dbSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      dbSubscription.gracePeriodEndsAt = null;

      await dbSubscription.save(); // Triggers pre-save hook!
      console.log(`✅ Recurring subscription activated for plan ${session.metadata.plan} with limits: agentLimit=${dbSubscription.agentLimit}, docLimit=${dbSubscription.docLimit}`);
    }
  }

  /* PAYMENT FAILED → GRACE PERIOD */
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;

    await Subscription.findOneAndUpdate(
      { stripeCustomerId: invoice.customer },
      {
        status: "PAST_DUE",
        gracePeriodEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      }
    );
  }

  /* SUBSCRIPTION CANCELED */
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;

    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: sub.id },
      { status: "CANCELED" }
    );
  }

  res.json({ received: true });
};
