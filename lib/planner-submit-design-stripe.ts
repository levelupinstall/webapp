import { getStripeServerFromEnv } from "@/lib/stripe-server";

const STRIPE_MIN_AUTHORIZATION_CENTS_CAD = 50;

export type PlannerSubmitStripeSessions = {
  immediateCheckoutUrl: string;
  immediateSessionId: string;
  laborHoldCheckoutUrl: string | null;
  laborHoldSessionId: string | null;
  laborHoldSkippedReason?: string;
};

/** Optional Stripe Checkout return URLs (e.g. portal proposal vs planner Design submitted). */
export type PlannerSubmitStripeReturnUrls = {
  immediateSuccessUrl: string;
  immediateCancelUrl: string;
  laborSuccessUrl: string;
  laborCancelUrl: string;
};

export async function createPlannerSubmitStripeSessions(params: {
  origin: string;
  jobId: string;
  proposalId: string;
  portalUserId: string;
  customerEmail: string;
  immediateAmountCents: number;
  laborHoldAmountCents: number;
  returnUrls?: PlannerSubmitStripeReturnUrls;
}): Promise<PlannerSubmitStripeSessions | null> {
  const stripe = getStripeServerFromEnv();
  if (!stripe) return null;

  const base = params.origin.replace(/\/$/, "");
  const successImmediate =
    params.returnUrls?.immediateSuccessUrl ??
    `${base}/planner/design-submitted?checkout_kind=immediate&job_id=${encodeURIComponent(params.jobId)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelImmediate =
    params.returnUrls?.immediateCancelUrl ??
    `${base}/planner/design-submitted?checkout_kind=cancelled`;

  const immediateSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: params.customerEmail,
    client_reference_id: params.portalUserId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: Math.max(100, params.immediateAmountCents),
          product_data: {
            name: "Design submit — call-out & materials",
            description:
              "Non-refundable call-out fee plus estimated materials deposit for your submitted built-in scope.",
          },
        },
      },
    ],
    metadata: {
      billingKind: "job_submit_immediate",
      jobId: params.jobId,
      proposalId: params.proposalId,
      portalUserId: params.portalUserId,
    },
    success_url: successImmediate,
    cancel_url: cancelImmediate,
  });

  if (!immediateSession.url) {
    throw new Error("Stripe did not return an immediate checkout URL.");
  }

  let laborHoldCheckoutUrl: string | null = null;
  let laborHoldSessionId: string | null = null;
  let laborHoldSkippedReason: string | undefined;

  let roundedHold = Math.round(params.laborHoldAmountCents);
  if (roundedHold <= 0) {
    laborHoldSkippedReason = "included_labor_window";
  } else if (roundedHold < STRIPE_MIN_AUTHORIZATION_CENTS_CAD) {
    laborHoldSkippedReason = "below_stripe_minimum_hold";
    roundedHold = 0;
  }

  if (roundedHold > 0) {
    const successHold =
      params.returnUrls?.laborSuccessUrl ??
      `${base}/planner/design-submitted?checkout_kind=labor_hold&job_id=${encodeURIComponent(params.jobId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelHold =
      params.returnUrls?.laborCancelUrl ??
      `${base}/planner/design-submitted?checkout_kind=labor_hold_cancelled`;

    const laborSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: params.customerEmail,
      client_reference_id: params.portalUserId,
      payment_intent_data: {
        capture_method: "manual",
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: roundedHold,
            product_data: {
              name: "Labor authorization hold",
              description:
                "Manual capture authorization for incremental labor beyond the included assessment window. Captured at completion.",
            },
          },
        },
      ],
      metadata: {
        billingKind: "job_submit_labor_hold",
        jobId: params.jobId,
        proposalId: params.proposalId,
        portalUserId: params.portalUserId,
      },
      success_url: successHold,
      cancel_url: cancelHold,
    });

    if (!laborSession.url) {
      throw new Error("Stripe did not return a labor hold checkout URL.");
    }

    laborHoldCheckoutUrl = laborSession.url;
    laborHoldSessionId = laborSession.id;
  }

  return {
    immediateCheckoutUrl: immediateSession.url,
    immediateSessionId: immediateSession.id,
    laborHoldCheckoutUrl,
    laborHoldSessionId,
    laborHoldSkippedReason,
  };
}
