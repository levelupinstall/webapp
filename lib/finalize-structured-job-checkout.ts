import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";

/** When Checkout completes for an approved structured Job (guest or portal). Idempotent. */
export async function finalizeStructuredJobCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return null;

  const md = session.metadata || {};
  if (md.billingKind !== "structured_job") return null;

  const jobId = md.structuredJobId?.trim();
  if (!jobId) return null;

  const amountTotal = session.amount_total ?? 0;
  if (!Number.isFinite(amountTotal) || amountTotal < 1) return null;

  const existing = await prisma.job.findUnique({ where: { id: jobId } });
  if (!existing) return null;

  if (
    existing.status === "PAID" &&
    existing.stripeCheckoutSessionId === session.id
  ) {
    return existing.id;
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "PAID",
      stripeCheckoutSessionId: session.id,
    },
  });

  return jobId;
}
