import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  getWorkProposalById,
  saveSiteMeasureVerification,
} from "@/lib/client-portal-store";

/** Site-measure verification: Tom confirms shop-drawing dims on site (after deposit). */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const portalUserId = (url.searchParams.get("portalUserId") ?? "").trim();
  const proposalId = (url.searchParams.get("proposalId") ?? "").trim();
  if (!portalUserId || !proposalId) {
    return NextResponse.json(
      { error: "portalUserId and proposalId required." },
      { status: 400 },
    );
  }

  const proposal = await getWorkProposalById(portalUserId, proposalId);
  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  return NextResponse.json({
    proposalId: proposal.id,
    title: proposal.title,
    status: proposal.status,
    shopDrawingDims: proposal.shopDrawingDims ?? [],
    siteMeasure: proposal.siteMeasure ?? null,
  });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    portalUserId?: string;
    proposalId?: string;
    actuals?: Record<string, number>;
    notes?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const portalUserId = String(body.portalUserId ?? "").trim();
  const proposalId = String(body.proposalId ?? "").trim();
  if (!portalUserId || !proposalId) {
    return NextResponse.json(
      { error: "portalUserId and proposalId required." },
      { status: 400 },
    );
  }

  const proposal = await saveSiteMeasureVerification({
    portalUserId,
    proposalId,
    actuals: body.actuals ?? {},
    notes: String(body.notes ?? ""),
  });
  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  return NextResponse.json({ ok: true, siteMeasure: proposal.siteMeasure });
}
