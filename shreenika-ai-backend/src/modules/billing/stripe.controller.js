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

      await Subscription.findOneAndUpdate(
        { userId },
        {
          stripeCustomerId: session.customer,
          plan: newPlan,
          activationFeePaid: true,
          pendingPlanUpgrade: null,
          stripeSessionId: null,
          status: "ACTIVE"
        }
      );

      console.log(`✅ User ${userId} upgraded to ${newPlan} plan`);
      return;
    }

    // ✅ Handle subscription payment (recurring)
    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription
      );

      await Subscription.findOneAndUpdate(
        { userId: session.metadata.userId },
        {
          stripeCustomerId: session.customer,
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.items.data[0].price.id,
          plan: session.metadata.plan,
          status: "ACTIVE",
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          gracePeriodEndsAt: null
        },
        { upsert: true }
      );
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
