import Link from "next/link";
import { finalizeBalanceCheckoutSession } from "@/lib/finalize-balance-checkout";
import { getStripeServer } from "@/lib/stripe-balance-checkout";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function PortalPaymentSuccessPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;
  const stripe = getStripeServer();

  if (!sessionId || !stripe) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-[#e9d9ff] bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#2d1546]">Payment status unavailable</h1>
          <p className="mt-3 text-sm text-[#55337b]">
            We could not verify this payment. Open Invoices in your client portal or contact the
            office if you were charged.
          </p>
          <Link
            href="/?section=account&portalView=invoices"
            className="mt-6 inline-block rounded-full bg-[#6e3eb2] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Client portal — Invoices
          </Link>
        </div>
      </main>
    );
  }

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
  const applied =
    checkoutSession.payment_status === "paid"
      ? await finalizeBalanceCheckoutSession(checkoutSession)
      : null;

  const balancePayment =
    checkoutSession.metadata?.billingKind === "balance" &&
    checkoutSession.payment_status === "paid";

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-[#d9c2fa] bg-[#f7f1ff] p-8">
        <h1 className="text-2xl font-semibold text-[#2d1546]">
          {balancePayment ? "Payment received" : "Checkout complete"}
        </h1>
        <p className="mt-3 text-[#55337b]">
          {balancePayment
            ? applied
              ? "Your balance invoice is marked paid in your portal. You can download the PDF from Invoices anytime."
              : "Thank you — your card payment went through. If your invoice still shows due after a minute, refresh the page or contact us."
            : "You can return home or open your portal."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/?section=account&portalView=invoices"
            className="rounded-full bg-[#6e3eb2] px-5 py-2.5 text-sm font-semibold text-white"
          >
            View invoices
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[#6e3eb2] px-5 py-2.5 text-sm font-semibold text-[#5b3292]"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
