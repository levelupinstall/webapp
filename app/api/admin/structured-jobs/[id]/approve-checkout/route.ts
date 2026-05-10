import { NextResponse } from "next/server";

import { revalidateAdminDashboard } from "@/lib/admin-revalidate";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { createStripeServer } from "@/lib/stripe-server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Payment is not configured (STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  const jobId = id.trim();
  if (!jobId) {
    return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const email = job.customerEmail.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        error:
          "Add a valid customer_email on this job row (database or future admin edit) before sending Stripe checkout.",
      },
      { status: 400 },
    );
  }

  const centsRaw =
    job.paymentAmountCents ?? Math.round(job.immediateCharge * 100);
  const cents = Math.round(centsRaw);
  if (!Number.isFinite(cents) || cents < 50) {
    return NextResponse.json(
      { error: "Job payment amount is invalid. Set payment_amount_cents or fix pricing fields." },
      { status: 400 },
    );
  }

  const stripe = createStripeServer(stripeSecretKey);

  if (
    job.status === "APPROVED_PENDING_PAYMENT" &&
    job.stripeCheckoutSessionId?.trim()
  ) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(
        job.stripeCheckoutSessionId.trim(),
      );
      if (
        existing.status === "open" &&
        typeof existing.url === "string" &&
        existing.url
      ) {
        return NextResponse.json({
          url: existing.url,
          reusedSession: true,
          message:
            "Existing checkout session is still open — send this link by email or SMS.",
        });
      }
    } catch {
      /* create a fresh session below */
    }
  }

  if (job.status !== "PENDING_REVIEW" && job.status !== "APPROVED_PENDING_PAYMENT") {
    return NextResponse.json(
      { error: `Job is not awaiting approval (status: ${job.status}).` },
      { status: 400 },
    );
  }

  const originHeader = _request.headers.get("origin");
  const origin =
    originHeader?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(_request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email,
    client_reference_id: job.portalUserId ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: cents,
          product_data: {
            name: `Level Up — job ${job.id.slice(0, 8)}`,
            description: "Structured job deposit / hold — Level Up Install",
          },
        },
      },
    ],
    metadata: {
      billingKind: "structured_job",
      structuredJobId: job.id,
      customerPhone: job.customerPhone.slice(0, 80),
      portalUserId: job.portalUserId ?? "",
    },
    success_url: `${origin}/job-payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Unable to create checkout session." },
      { status: 500 },
    );
  }

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "APPROVED_PENDING_PAYMENT",
      stripeCheckoutSessionId: session.id,
    },
  });

  revalidateAdminDashboard();

  return NextResponse.json({
    url: session.url,
    message:
      "Share this Stripe Checkout link with the customer by email or text. Stripe will email the receipt to the address on file.",
  });
}
