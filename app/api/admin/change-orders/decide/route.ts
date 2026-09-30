import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  appendPortalCommunication,
  decideChangeOrder,
} from "@/lib/client-portal-store";

type Body = {
  portalUserId?: string;
  proposalId?: string;
  changeOrderId?: string;
  decision?: string;
};

/**
 * Tom records a change-order decision himself (e.g. the customer approved it
 * verbally on site). The customer can also decide via the public proposal link.
 */
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
  const changeOrderId = String(body.changeOrderId ?? "").trim();
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  if (!portalUserId || !proposalId || !changeOrderId || !decision) {
    return NextResponse.json(
      { error: "portalUserId, proposalId, changeOrderId and decision (approved|rejected) required." },
      { status: 400 },
    );
  }

  const changeOrder = await decideChangeOrder({
    portalUserId,
    proposalId,
    changeOrderId,
    decision,
    decidedBy: "Tom",
    decidedVia: "admin",
  });
  if (!changeOrder) {
    return NextResponse.json({ error: "Change order not found or already decided." }, { status: 404 });
  }

  await appendPortalCommunication({
    portalUserId,
    channel: "app_notice",
    summary: `Change order "${changeOrder.title}" ${changeOrder.status} (recorded by Tom) — $${changeOrder.totalCad.toFixed(2)} CAD.`,
    recordedBy: "Tom (admin)",
  });

  return NextResponse.json({ ok: true, changeOrder });
}
