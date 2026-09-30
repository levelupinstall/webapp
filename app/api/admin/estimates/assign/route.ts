import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  adminPatchEstimate,
  getEstimateById,
} from "@/lib/client-portal-store";
import type { EstimateLineItem } from "@/lib/planner-estimate";
import { getRateCard } from "@/lib/rate-card";

type Body = {
  portalUserId?: string;
  estimateId?: string;
  /** Update one labour line's assignment. */
  lineId?: string;
  assignee?: "tom" | "sub";
  subRateCad?: number;
  /** Set the estimate-level installer (carpenter account id, or null/"" for Tom). */
  assignedCarpenterId?: string | null;
};

/**
 * Assign estimate labour to Tom or a sub, and set the estimate-level installer.
 * Locked estimates (approved/paid/final_quote) cannot be changed.
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
  if (["approved", "paid", "final_quote"].includes(estimate.status)) {
    return NextResponse.json({ error: "This estimate is locked." }, { status: 409 });
  }

  let lineItems: EstimateLineItem[] | undefined;
  if (body.lineId) {
    const line = estimate.lineItems.find((l) => l.id === body.lineId);
    if (!line) return NextResponse.json({ error: "Line item not found." }, { status: 404 });
    if (line.category !== "labor") {
      return NextResponse.json({ error: "Only labour lines can be assigned." }, { status: 400 });
    }
    const assignee = body.assignee === "sub" ? "sub" : "tom";
    const card = await getRateCard();
    const subRate =
      assignee === "sub"
        ? typeof body.subRateCad === "number" &&
          Number.isFinite(body.subRateCad) &&
          body.subRateCad >= 0
          ? Math.round(body.subRateCad * 100) / 100
          : (line.subRateCad ?? card.defaultSubRateCad)
        : undefined;
    lineItems = estimate.lineItems.map((l) =>
      l.id === body.lineId
        ? {
            ...l,
            assignee,
            ...(subRate !== undefined ? { subRateCad: subRate } : { subRateCad: undefined }),
          }
        : l,
    );
  }

  const assignedCarpenterId =
    body.assignedCarpenterId !== undefined
      ? String(body.assignedCarpenterId || "").trim() || null
      : undefined;

  if (!lineItems && assignedCarpenterId === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await adminPatchEstimate({
    portalUserId,
    estimateId,
    ...(lineItems ? { lineItems } : {}),
    ...(assignedCarpenterId !== undefined ? { assignedCarpenterId } : {}),
  });
  return NextResponse.json({
    ok: true,
    subcontractedCostCad: updated.subcontractedCostCad,
    laborMarginCad: updated.laborMarginCad,
    totalCad: updated.totalCad,
  });
}
