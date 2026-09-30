import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  appendPortalCommunication,
  getEstimateById,
  setEstimateStatus,
  setPortalUserProjectPhase,
} from "@/lib/client-portal-store";
import { SALES_PIPELINE_PHASES } from "@/lib/planner-sales-handoff";
import type { EstimateStatus } from "@/lib/planner-estimate";

type Body = {
  portalUserId?: string;
  estimateId?: string;
  status?: string;
};

const ALLOWED: EstimateStatus[] = ["draft", "sent", "site_measure", "final_quote"];

const PHASE_FOR_STATUS: Partial<Record<EstimateStatus, string>> = {
  draft: SALES_PIPELINE_PHASES.estimateDrafted,
  sent: SALES_PIPELINE_PHASES.estimateSent,
  site_measure: SALES_PIPELINE_PHASES.siteMeasure,
  final_quote: SALES_PIPELINE_PHASES.finalQuote,
};

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
  const status = String(body.status ?? "").trim() as EstimateStatus;
  if (!portalUserId || !estimateId || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "portalUserId, estimateId, valid status required." }, { status: 400 });
  }

  const existing = await getEstimateById(portalUserId, estimateId);
  if (!existing) return NextResponse.json({ error: "Estimate not found." }, { status: 404 });

  const updated = await setEstimateStatus({ portalUserId, estimateId, status });
  const phase = PHASE_FOR_STATUS[status];
  if (phase) {
    await setPortalUserProjectPhase({
      portalUserId,
      phase,
      details: `Estimate "${updated.title}" → ${phase} ($${updated.totalCad.toFixed(2)} CAD).`,
    });
  }
  await appendPortalCommunication({
    portalUserId,
    channel: "app_notice",
    summary: `Estimate moved to ${phase ?? status}`,
    detail: `Estimate total $${updated.totalCad.toFixed(2)} CAD.`,
    recordedBy: "Tom",
  });

  return NextResponse.json({ ok: true });
}
