import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  appendPortalCommunication,
  createEstimateForPortalUser,
  getEstimatesForPortalUser,
  getPortalUserById,
  setPortalUserProjectPhase,
} from "@/lib/client-portal-store";
import { generatePlannerEstimate } from "@/lib/planner-estimate";
import { SALES_PIPELINE_PHASES } from "@/lib/planner-sales-handoff";

type Body = { portalUserId?: string };

function buildTranscript(activities: Array<{
  promptFull?: string;
  replyFull?: string;
  promptPreview?: string;
  replyPreview?: string;
}>): string {
  return activities
    .slice(-12)
    .map(
      (a) =>
        `Homeowner: ${(a.promptFull || a.promptPreview || "").slice(0, 2000)}\nAlex: ${(a.replyFull || a.replyPreview || "").slice(0, 2000)}`,
    )
    .join("\n\n")
    .slice(-16_000);
}

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
  if (!portalUserId) {
    return NextResponse.json({ error: "portalUserId required." }, { status: 400 });
  }

  const profile = await getPortalUserById(portalUserId);
  if (!profile) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const existing = await getEstimatesForPortalUser(portalUserId);
  const active = existing.find((e) => !["approved", "paid"].includes(e.status));
  if (active) {
    return NextResponse.json(
      { error: "An active estimate already exists for this client.", estimateId: active.id },
      { status: 409 },
    );
  }

  const full = await import("@/lib/client-portal-store").then((m) =>
    m.getUserPortalData(portalUserId).catch(() => null),
  );
  const activities = (full as { aiPlannerActivity?: Array<{ promptFull?: string; replyFull?: string; promptPreview?: string; replyPreview?: string }> } | null)?.aiPlannerActivity ?? [];

  const estimate = await generatePlannerEstimate({
    transcript: buildTranscript(activities) || "(no planner transcript captured)",
    dimsSummary: "",
    dwellingLabel: "",
    category: "",
  });
  estimate.title = `${(profile.fullName || profile.email || "Client").trim().slice(0, 60)} — AI estimate`;

  await createEstimateForPortalUser(portalUserId, estimate);
  await setPortalUserProjectPhase({
    portalUserId,
    phase: SALES_PIPELINE_PHASES.estimateDrafted,
    details: `AI estimate drafted (${estimate.lineItems.length} line items, $${estimate.totalCad.toFixed(2)} CAD). Awaiting Tom's review.`,
  });
  await appendPortalCommunication({
    portalUserId,
    channel: "app_notice",
    summary: "AI estimate drafted for Tom's review",
    detail: `Total $${estimate.totalCad.toFixed(2)} CAD across ${estimate.lineItems.length} line items.`,
    recordedBy: "AI estimator",
  });

  return NextResponse.json({ ok: true, estimateId: estimate.id });
}
