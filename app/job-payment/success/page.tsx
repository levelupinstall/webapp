import Link from "next/link";

import { finalizeStructuredJobCheckout } from "@/lib/finalize-structured-job-checkout";
import { createStripeServer } from "@/lib/stripe-server";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function StructuredJobPaymentSuccessPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const stripe = stripeKey ? createStripeServer(stripeKey) : null;

  let paid = false;
  if (sessionId && stripe) {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    paid =
      checkoutSession.payment_status === "paid" &&
      checkoutSession.metadata?.billingKind === "structured_job";
    if (checkoutSession.payment_status === "paid") {
      await finalizeStructuredJobCheckout(checkoutSession);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-[#d9c2fa] bg-[#f7f1ff] p-8">
        <h1 className="text-2xl font-semibold text-[#2d1546]">
          {paid ? "Payment received" : "Thank you"}
        </h1>
        <p className="mt-3 text-sm text-[#55337b]">
          {paid
            ? "Thank you. Your payment was recorded and our team will follow up on next steps."
            : "If you completed payment, confirmation may take a moment. Keep your Stripe receipt email for your records."}
        </p>
        {sessionId ? (
          <p className="mt-2 font-mono text-xs text-[#8b7aa8]">Reference: {sessionId}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full bg-[#6e3eb2] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
