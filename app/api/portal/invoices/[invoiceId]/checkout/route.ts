import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  getUserPortalData,
  setBalanceInvoicePendingSession,
} from "@/lib/client-portal-store";
import { createBalanceCheckoutSession, getStripeServer } from "@/lib/stripe-balance-checkout";

export async function POST(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const auth = await getSessionFromCookie();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const stripe = getStripeServer();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments are not configured. Add STRIPE_SECRET_KEY." },
      { status: 503 },
    );
  }

  const user = await getUserPortalData(auth.userId);
  const invoice = user.invoices.find((item) => item.id === invoiceId);
  if (!invoice || invoice.status !== "due") {
    return NextResponse.json({ error: "Invoice not found or already paid." }, { status: 400 });
  }

  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";

  if (invoice.pendingStripeSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(invoice.pendingStripeSessionId);
      if (existing.status === "open" && existing.url) {
        return NextResponse.json({ url: existing.url });
      }
    } catch {
      /* session expired or invalid — issue a new one */
    }
  }

  const checkoutSession = await createBalanceCheckoutSession({
    origin,
    portalUserId: auth.userId,
    invoiceId: invoice.id,
    customerEmail: user.email,
    amountCents: invoice.amountCents,
    projectName: invoice.projectName,
    descriptionLines: invoice.lineItemsSummary,
  });

  await setBalanceInvoicePendingSession(auth.userId, invoice.id, checkoutSession.id);

  return NextResponse.json({ url: checkoutSession.url });
}
