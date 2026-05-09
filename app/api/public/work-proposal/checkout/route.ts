import { NextResponse } from "next/server";
import { createStripeServer } from "@/lib/stripe-server";
import {
  findPortalUserAndProposalByViewToken,
  getPortalUserById,
} from "@/lib/client-portal-store";

type Body = { token?: string };

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Payment is not configured (STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const found = await findPortalUserAndProposalByViewToken(token);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { proposal, portalUserId } = found;
  if (proposal.status !== "accepted_pending_payment") {
    return NextResponse.json(
      { error: "Accept the proposal and terms before paying." },
      { status: 400 },
    );
  }

  const cents = proposal.paymentAmountCents;
  if (!Number.isFinite(cents) || cents < 50) {
    return NextResponse.json({ error: "Invalid proposal amount." }, { status: 400 });
  }

  const profile = await getPortalUserById(portalUserId);
  if (!profile?.email) {
    return NextResponse.json({ error: "Customer email missing." }, { status: 400 });
  }

  const origin = request.headers.get("origin") || new URL(request.url).origin;

  const stripe = createStripeServer(stripeSecretKey);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: profile.email,
    client_reference_id: portalUserId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: cents,
          product_data: {
            name: proposal.title.slice(0, 120),
            description: "Work proposal — Level Up Install",
          },
        },
      },
    ],
    metadata: {
      billingKind: "work_proposal",
      portalUserId,
      proposalId: proposal.id,
      agreedSigner: proposal.acceptedSignerName ?? "",
    },
    success_url: `${origin}/portal/proposal/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/portal/proposal?t=${encodeURIComponent(token)}`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Unable to create checkout session." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
