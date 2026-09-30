import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  addChangeOrderToProposal,
  appendPortalCommunication,
} from "@/lib/client-portal-store";

type LineItemBody = {
  description?: string;
  quantity?: number;
  unit?: string;
  unitCostCad?: number;
};

type Body = {
  portalUserId?: string;
  proposalId?: string;
  title?: string;
  description?: string;
  internalNote?: string;
  lineItems?: LineItemBody[];
};

/** Tom proposes extra work outside the approved scope: priced, awaiting customer approval. */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const portalUserId = String(body.portalUserId ?? "").trim();
  const proposalId = String(body.proposalId ?? "").trim();
  if (!portalUserId || !proposalId) {
    return NextResponse.json({ error: "portalUserId and proposalId required." }, { status: 400 });
  }

  const changeOrder = await addChangeOrderToProposal({
    portalUserId,
    proposalId,
    title: String(body.title ?? ""),
    description: String(body.description ?? ""),
    internalNote: String(body.internalNote ?? ""),
    lineItems: (Array.isArray(body.lineItems) ? body.lineItems : []).map((l) => ({
      description: String(l?.description ?? ""),
      quantity: Number(l?.quantity ?? 0),
      unit: String(l?.unit ?? ""),
      unitCostCad: Number(l?.unitCostCad ?? 0),
    })),
  });
  if (!changeOrder) {
    return NextResponse.json(
      { error: "Could not create change order. Check the title and line items." },
      { status: 400 },
    );
  }

  await appendPortalCommunication({
    portalUserId,
    channel: "app_notice",
    summary: `Change order proposed: "${changeOrder.title}" — $${changeOrder.totalCad.toFixed(2)} CAD. Sent to customer for approval before extra work proceeds.`,
    recordedBy: "Tom (admin)",
  });

  return NextResponse.json({ ok: true, changeOrder });
}
