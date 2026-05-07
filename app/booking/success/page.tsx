import Link from "next/link";
import Stripe from "stripe";
import {
  addPaidInvoiceByEmail,
  addPaidInvoiceByUserId,
} from "@/lib/client-portal-store";
import { upsertWorkRequestFromPaidBooking } from "@/lib/work-requests-store";

type SuccessProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function BookingSuccessPage({ searchParams }: SuccessProps) {
  const { session_id: sessionId } = await searchParams;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!sessionId || !stripeSecretKey) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
        <div className="rounded-3xl border border-[#e9d9ff] bg-white p-8">
          <h1 className="text-2xl font-semibold text-[#2d1546]">
            Payment Confirmation Unavailable
          </h1>
          <p className="mt-3 text-[#55337b]">
            We could not verify this booking payment. Please contact
            info@levelupinstall.ca for assistance.
          </p>
        </div>
      </main>
    );
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-04-30.basil" });
  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

  const paid = checkoutSession.payment_status === "paid";
  const customerEmail = checkoutSession.customer_details?.email || checkoutSession.customer_email;
  const amountTotal = checkoutSession.amount_total || 0;
  const projectName = "Call-Out Fee";
  const portalUserId =
    checkoutSession.client_reference_id || checkoutSession.metadata?.portalUserId;

  let invoiceLinked = false;
  if (paid && portalUserId) {
    const created = await addPaidInvoiceByUserId({
      userId: portalUserId,
      receiptEmail: customerEmail || undefined,
      amountCents: amountTotal,
      projectName,
      stripeSessionId: checkoutSession.id,
    });
    invoiceLinked = Boolean(created);
  } else if (paid && customerEmail) {
    const created = await addPaidInvoiceByEmail({
      email: customerEmail,
      amountCents: amountTotal,
      projectName,
      stripeSessionId: checkoutSession.id,
    });
    invoiceLinked = Boolean(created);
  }

  if (paid && checkoutSession.metadata) {
    const meta = checkoutSession.metadata;
    try {
      await upsertWorkRequestFromPaidBooking({
        stripeSessionId: checkoutSession.id,
        paidAmountCents: amountTotal,
        fullName: meta.fullName || "",
        email: meta.email || customerEmail || "",
        phone: meta.phone || "",
        projectAddress: meta.projectAddress || "",
        preferredDate: meta.preferredDate || "",
        projectDetails: meta.projectDetails || "",
        signatureName: "",
        portalUserId: portalUserId ? String(portalUserId) : meta.portalUserId || "",
      });
    } catch {
      /* Work request logging must not break confirmation page */
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
      <div className="rounded-3xl border border-[#d9c2fa] bg-[#f7f1ff] p-8">
        <h1 className="text-3xl font-semibold text-[#2d1546]">Booking Confirmed</h1>
        <p className="mt-3 text-[#55337b]">
          Your $150 call-out fee payment was successful. Thank you for booking with
          Level Up Install.
        </p>
        <p className="mt-2 text-sm text-[#5e3e86]">
          {invoiceLinked
            ? "Your invoice has been added to your Client Portal automatically."
            : "If you already have a portal account, use the same email at booking to auto-link invoices."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full bg-[#6e3eb2] px-5 py-3 text-sm font-semibold text-white"
          >
            Return Home
          </Link>
          <Link
            href="/?section=account"
            className="rounded-full border border-[#6e3eb2] px-5 py-3 text-sm font-semibold text-[#5b3292]"
          >
            Open Client Portal
          </Link>
        </div>
      </div>
    </main>
  );
}

