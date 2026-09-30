import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getRateCard, updateRateCard } from "@/lib/rate-card";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const card = await getRateCard();
  return NextResponse.json({ ok: true, rateCard: card });
}

export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const card = await updateRateCard({
    laborRateCad: body.laborRateCad as number | undefined,
    callOutFeeCad: body.callOutFeeCad as number | undefined,
    procurementMarkupPct: body.procurementMarkupPct as number | undefined,
    defaultSubRateCad: body.defaultSubRateCad as number | undefined,
    includedLaborHours: body.includedLaborHours as number | undefined,
    carpentryMarginPct: body.carpentryMarginPct as number | undefined,
  });
  return NextResponse.json({ ok: true, rateCard: card });
}
