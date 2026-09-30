import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  appendPortalCommunication,
  createWorkProposalDraftForPortalUser,
  getEstimateById,
  setEstimateStatus,
  setPortalUserProjectPhase,
} from "@/lib/client-portal-store";
import { estimateToMarkdown } from "@/lib/planner-estimate";
import { SALES_PIPELINE_PHASES } from "@/lib/planner-sales-handoff";

type Body = { portalUserId?: string; estimateId?: string };

/**
 * Lock an estimate into a formal final quote: creates a work-proposal draft
 * carrying the estimate's line items and total, so the existing
 * send → accept → Stripe payment flow takes over.
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
  const estimateId = String(body.estimateId ?? "").trim();
  if (!portalUserId || !estimateId) {
    return NextResponse.json({ error: "portalUserId and estimateId required." }, { status: 400 });
  }

  const estimate = await getEstimateById(portalUserId, estimateId);
  if (!estimate) return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  if (estimate.status === "final_quote" || estimate.status === "approved" || estimate.status === "paid") {
    return NextResponse.json({ error: "Estimate already converted or locked." }, { status: 400 });
  }

  const proposal = await createWorkProposalDraftForPortalUser({
    portalUserId,
    title: estimate.title.replace(/— AI estimate$/, "— Final quote").trim() || "Final quote",
    markdownBody: estimateToMarkdown(estimate),
    paymentAmountCents: Math.max(100, Math.round(estimate.totalCad * 100)),
    renderings: [],
  });
  if (!proposal) {
    return NextResponse.json({ error: "Could not create the final quote." }, { status: 500 });
  }

  await setEstimateStatus({ portalUserId, estimateId, status: "final_quote" });
  await setPortalUserProjectPhase({
    portalUserId,
    phase: SALES_PIPELINE_PHASES.finalQuote,
    details: `Final quote created from estimate ($${estimate.totalCad.toFixed(2)} CAD). Ready to send for approval and payment.`,
  });
  await appendPortalCommunication({
    portalUserId,
    channel: "app_notice",
    summary: `Estimate converted to final quote — $${estimate.totalCad.toFixed(2)} CAD`,
    detail: "Review the proposal draft, then email it to the customer for approval and Stripe payment.",
    recordedBy: "Tom",
  });

  return NextResponse.json({ ok: true, proposalId: proposal.id });
}
