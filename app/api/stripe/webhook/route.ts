import { NextResponse } from "next/server";
import Stripe from "stripe";
import { finalizeBalanceCheckoutSession } from "@/lib/finalize-balance-checkout";
import { STRIPE_CHECKOUT_API_VERSION } from "@/lib/stripe-balance-checkout";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!webhookSecret || !stripeKey) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_CHECKOUT_API_VERSION });
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature header." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object as Stripe.Checkout.Session;
    await finalizeBalanceCheckoutSession(checkoutSession);
  }

  return NextResponse.json({ received: true });
}
