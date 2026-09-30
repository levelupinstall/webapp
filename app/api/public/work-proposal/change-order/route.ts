import { NextResponse } from "next/server";
import {
  appendPortalCommunication,
  decideChangeOrder,
  findPortalUserAndProposalByViewToken,
} from "@/lib/client-portal-store";

type Body = {
  token?: string;
  changeOrderId?: string;
  decision?: string;
  signerName?: string;
};

/** Customer approves or declines a proposed change order from the proposal link. */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const changeOrderId = String(body.changeOrderId ?? "").trim();
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  const signerName = String(body.signerName ?? "").trim();
  if (!token || !changeOrderId || !decision) {
    return NextResponse.json(
      { error: "token, changeOrderId and decision (approved|rejected) required." },
      { status: 400 },
    );
  }
  if (decision === "approved" && !signerName) {
    return NextResponse.json(
      { error: "Please add your name to approve the change order." },
      { status: 400 },
    );
  }

  const found = await findPortalUserAndProposalByViewToken(token);
  if (!found) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  const changeOrder = await decideChangeOrder({
    portalUserId: found.portalUserId,
    proposalId: found.proposal.id,
    changeOrderId,
    decision,
    decidedBy: signerName || "Customer",
    decidedVia: "customer",
  });
  if (!changeOrder) {
    return NextResponse.json(
      { error: "Change order not found, already decided, or no longer open." },
      { status: 404 },
    );
  }

  await appendPortalCommunication({
    portalUserId: found.portalUserId,
    channel: "app_notice",
    summary: `Customer ${decision === "approved" ? "approved" : "declined"} change order "${changeOrder.title}" ($${changeOrder.totalCad.toFixed(2)} CAD) via the proposal link.`,
    recordedBy: signerName || "Customer",
  });

  return NextResponse.json({ ok: true, changeOrder });
}
