import type Stripe from "stripe";

import { Prisma } from "@prisma/client";

import { revalidateAdminDashboard } from "@/lib/admin-revalidate";
import { prisma } from "@/lib/prisma";

/**
 * When Checkout completes for `billingKind: job_submit_immediate` (call-out + materials).
 * Activates the structured Job for installation after deposit is captured.
 */
export async function finalizeJobSubmitImmediateCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return null;

  const md = session.metadata || {};
  if (md.billingKind !== "job_submit_immediate") return null;

  const jobId = md.jobId?.trim();
  if (!jobId) return null;

  const amountTotal = session.amount_total ?? 0;
  if (!Number.isFinite(amountTotal) || amountTotal < 1) return null;

  const existing = await prisma.job.findUnique({ where: { id: jobId } });
  if (!existing) return null;

  if (existing.status === "CURRENT_JOB" && existing.stripeCheckoutSessionId === session.id) {
    return existing.id;
  }

  /** Deposit captured — move into active install pipeline when still awaiting deposit. */
  const activatable = new Set([
    "PROPOSAL_SENT",
    "PENDING_REVIEW",
    "APPROVED_PENDING_PAYMENT",
  ]);
  if (!activatable.has(existing.status)) {
    return existing.id;
  }

  const prevLb =
    existing.laborBreakdown &&
    typeof existing.laborBreakdown === "object" &&
    !Array.isArray(existing.laborBreakdown)
      ? ({ ...(existing.laborBreakdown as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  prevLb.captureActivate = {
    at: new Date().toISOString(),
    stripeCheckoutSessionId: session.id,
    paidAmountCents: amountTotal,
    billingKind: "job_submit_immediate",
  };

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "CURRENT_JOB",
      stripeCheckoutSessionId: session.id,
      laborBreakdown: prevLb as Prisma.InputJsonValue,
    },
  });

  revalidateAdminDashboard();

  return jobId;
}
