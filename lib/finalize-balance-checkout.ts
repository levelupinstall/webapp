import type Stripe from "stripe";
import { markBalanceInvoicePaid } from "@/lib/client-portal-store";

/** Applies phase-2 balance payment when Checkout completes (webhook or success page). Idempotent. */
export async function finalizeBalanceCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return null;

  const md = session.metadata || {};
  if (md.billingKind !== "balance") return null;

  const portalUserId = md.portalUserId?.trim();
  const invoiceId = md.invoiceId?.trim();
  if (!portalUserId || !invoiceId) return null;

  const amountTotal = session.amount_total ?? 0;
  if (!Number.isFinite(amountTotal) || amountTotal < 1) return null;

  try {
    return await markBalanceInvoicePaid({
      portalUserId,
      invoiceId,
      stripeSessionId: session.id,
      paidAmountCents: amountTotal,
    });
  } catch {
    return null;
  }
}
