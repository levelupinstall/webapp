import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { createDueBalanceInvoice } from "@/lib/client-portal-store";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    portalUserId?: string;
    projectName?: string;
    amountDollars?: string | number;
    lineItemsSummary?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const portalUserId = String(body.portalUserId ?? "").trim();
  const projectName = String(body.projectName ?? "").trim() || "Project balance";
  const rawAmount = body.amountDollars;
  const amountNum =
    typeof rawAmount === "number"
      ? rawAmount
      : Number.parseFloat(String(rawAmount ?? "").trim());

  if (!portalUserId) {
    return NextResponse.json({ error: "portalUserId is required." }, { status: 400 });
  }
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: "Enter a valid amount greater than zero." }, { status: 400 });
  }

  const amountCents = Math.round(amountNum * 100);
  if (amountCents < 1) {
    return NextResponse.json({ error: "Amount too small." }, { status: 400 });
  }

  try {
    const invoice = await createDueBalanceInvoice({
      portalUserId,
      projectName,
      amountCents,
      lineItemsSummary: body.lineItemsSummary,
    });
    return NextResponse.json({ invoice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create invoice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
