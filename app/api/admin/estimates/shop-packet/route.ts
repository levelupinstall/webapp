import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  appendPortalCommunication,
  getEstimateById,
  getLatestBlueprintRendering,
  getUserPortalData,
  setEstimateShopPacket,
  setPortalUserProjectPhase,
} from "@/lib/client-portal-store";
import { geminiGenerateShopPacket } from "@/lib/gemini-client";
import type { ShopPacket } from "@/lib/planner-estimate";
import { SALES_PIPELINE_PHASES } from "@/lib/planner-sales-handoff";

type Body = { portalUserId?: string; estimateId?: string };

/**
 * Generate the dimensioned shop packet: approved rendering + REAL site
 * measurements → element schedule with heights/reference points + install steps.
 * Dimensions always come from the site measure, never from the picture.
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

  const m = estimate.siteMeasurements;
  if (!m) {
    return NextResponse.json(
      { error: "Record the site measurements first — the packet is dimensioned from real measurements, not the picture." },
      { status: 400 },
    );
  }

  const rendering = await getLatestBlueprintRendering(portalUserId);
  if (!rendering) {
    return NextResponse.json(
      { error: "No approved design rendering found for this client." },
      { status: 400 },
    );
  }

  let transcript = "";
  try {
    const full = (await getUserPortalData(portalUserId)) as {
      aiPlannerActivity?: Array<{ promptFull?: string; replyFull?: string }>;
    };
    transcript = (full.aiPlannerActivity ?? [])
      .slice(-6)
      .map((a) => `Homeowner: ${(a.promptFull ?? "").slice(0, 1500)}\nAlex: ${(a.replyFull ?? "").slice(0, 1500)}`)
      .join("\n\n")
      .slice(-8000);
  } catch {
    transcript = "";
  }

  const materialDescriptions = estimate.lineItems
    .filter((l) => l.category === "material")
    .map((l) => `${l.description}${l.detail ? ` — ${l.detail}` : ""}`);

  const generated = await geminiGenerateShopPacket({
    renderingMimeType: rendering.mimeType,
    renderingDataBase64: rendering.dataBase64,
    wallWidthIn: m.wallWidthIn,
    wallHeightIn: m.wallHeightIn,
    ceilingHeightIn: m.ceilingHeightIn,
    measurementNotes: m.notes,
    transcript: transcript || estimate.sourceSummary,
    materialDescriptions,
  });
  if (!generated || generated.elements.length === 0) {
    return NextResponse.json(
      { error: "The AI could not draft the packet from this rendering. Try again or check the measurements.",
        _debug: (globalThis as Record<string, unknown>).__shopPacketDebug ?? null },
      { status: 502 },
    );
  }

  const packet: ShopPacket = {
    generatedAt: new Date().toISOString(),
    wallWidthIn: m.wallWidthIn,
    wallHeightIn: m.wallHeightIn,
    ceilingHeightIn: m.ceilingHeightIn,
    datumDescription: generated.datumDescription,
    elements: generated.elements,
    installSteps: generated.installSteps,
    warnings: generated.warnings,
  };

  const updated = await setEstimateShopPacket({ portalUserId, estimateId, packet });
  await setPortalUserProjectPhase({
    portalUserId,
    phase: SALES_PIPELINE_PHASES.siteMeasure,
    details: `Shop packet generated: ${packet.elements.length} dimensioned elements from the approved design + site measurements. Ready for the installer.`,
  });
  await appendPortalCommunication({
    portalUserId,
    channel: "app_notice",
    summary: "Shop packet generated",
    detail: `${packet.elements.length} elements, install sequence, and warnings drafted from site measurements.`,
    recordedBy: "AI estimator",
  });

  return NextResponse.json({ ok: true, shopPacket: updated.shopPacket });
}
