import Stripe from "stripe";

export const STRIPE_CHECKOUT_API_VERSION = "2026-04-22.dahlia";

export function createStripeServer(secretKey: string) {
  return new Stripe(secretKey, { apiVersion: STRIPE_CHECKOUT_API_VERSION });
}

export function getStripeServerFromEnv(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return createStripeServer(key);
}
