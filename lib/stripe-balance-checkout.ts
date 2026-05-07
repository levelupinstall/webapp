import Stripe from "stripe";

export const STRIPE_CHECKOUT_API_VERSION = "2025-04-30.basil";

export function getStripeServer(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_CHECKOUT_API_VERSION });
}

export async function createBalanceCheckoutSession(params: {
  origin: string;
  portalUserId: string;
  invoiceId: string;
  customerEmail: string;
  amountCents: number;
  projectName: string;
  descriptionLines?: string;
}) {
  const stripe = getStripeServer();
  if (!stripe) throw new Error("Stripe is not configured.");

  const descriptionBits = [
    "Approved scope / labour & materials balance (phase 2).",
    params.descriptionLines?.trim() ? params.descriptionLines.trim().slice(0, 450) : "",
  ]
    .filter(Boolean)
    .join(" ");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: params.customerEmail,
    client_reference_id: params.portalUserId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: params.amountCents,
          product_data: {
            name: params.projectName,
            description: descriptionBits.slice(0, 500),
          },
        },
      },
    ],
    metadata: {
      billingKind: "balance",
      portalUserId: params.portalUserId,
      invoiceId: params.invoiceId,
    },
    success_url: `${params.origin}/portal/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.origin}/?section=account&portalView=invoices`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session;
}
