import Stripe from "stripe";

let stripe = null;

// Only initialize Stripe if API key is configured
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  });
} else {
  console.warn('⚠️  Stripe API key not configured (STRIPE_SECRET_KEY env var missing)');
}

export default stripe;
