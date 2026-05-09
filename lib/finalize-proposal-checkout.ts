import type Stripe from "stripe";
import { markWorkProposalPaid } from "@/lib/client-portal-store";

/** When Checkout completes for an accepted work proposal. Idempotent. */
export async function finalizeProposalCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return null;

  const md = session.metadata || {};
  if (md.billingKind !== "work_proposal") return null;

  const portalUserId = md.portalUserId?.trim();
  const proposalId = md.proposalId?.trim();
  if (!portalUserId || !proposalId) return null;

  const amountTotal = session.amount_total ?? 0;
  if (!Number.isFinite(amountTotal) || amountTotal < 1) return null;

  try {
    return await markWorkProposalPaid({
      portalUserId,
      proposalId,
      stripeSessionId: session.id,
      paidAmountCents: amountTotal,
    });
  } catch {
    return null;
  }
}
