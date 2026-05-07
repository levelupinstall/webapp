import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { createStripeServer } from "@/lib/stripe-server";

type BookingRequest = {
  fullName: string;
  email: string;
  phone: string;
  projectAddress: string;
  preferredDate: string;
  projectDetails: string;
  agreedToTerms: boolean;
};

const CALL_OUT_FEE_CENTS = 15000;

function required(value: string) {
  return value && value.trim().length > 0;
}

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        {
          error:
            "Payment is not configured yet. Add STRIPE_SECRET_KEY in your environment.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as BookingRequest;
    const { fullName, email, phone, projectAddress, preferredDate, projectDetails, agreedToTerms } =
      body;

    if (
      !required(fullName) ||
      !required(email) ||
      !required(phone) ||
      !required(projectAddress) ||
      !required(preferredDate)
    ) {
      return NextResponse.json(
        { error: "Please complete all required booking fields." },
        { status: 400 },
      );
    }

    if (!agreedToTerms) {
      return NextResponse.json(
        { error: "Terms of Service must be accepted." },
        { status: 400 },
      );
    }

    const stripe = createStripeServer(stripeSecretKey);
    const portalSession = await getSessionFromCookie();

    const origin = request.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: portalSession?.userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: CALL_OUT_FEE_CENTS,
            product_data: {
              name: "Level Up Install Call-Out Fee",
              description:
                "Booking deposit for on-site finish carpentry consultation and service call.",
            },
          },
        },
      ],
      metadata: {
        fullName,
        email,
        phone,
        projectAddress,
        preferredDate,
        projectDetails: projectDetails || "Not provided",
        agreedToTerms: String(agreedToTerms),
        portalUserId: portalSession?.userId || "",
      },
      success_url: `${origin}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?booking=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Unable to create payment session." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Unable to start secure checkout right now." },
      { status: 500 },
    );
  }
}
