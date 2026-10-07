import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getWorkProposalById } from "@/lib/client-portal-store";
import {
  fabInputFromDims,
  buildSectionSheet,
  buildCutListSheet,
} from "@/lib/planner-fabrication";

/**
 * Internal fabrication package (NOT customer-facing). Generates, per wall,
 * a typical-section sheet and a cut-list sheet from the proposal's
 * shop-drawing dimension checklist. Tom uses these to build/install.
 */
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

  const dims = proposal.shopDrawingDims ?? [];
  const wallLabels = [...new Set(dims.map((d) => d.wallLabel))];
  if (wallLabels.length === 0) {
    return NextResponse.json(
      { error: "No shop-drawing dimensions on this proposal yet." },
      { status: 422 },
    );
  }

  const sheets: Array<{
    wallLabel: string;
    kind: string;
    caption: string;
    mimeType: string;
    dataBase64: string;
    verified: boolean;
  }> = [];
  let sheetNo = 0;
  const sheetCount = wallLabels.length * 2;
  const actuals = proposal.siteMeasure?.actuals;
  const verifiedAt = proposal.siteMeasure?.verifiedAt;
  for (const wallLabel of wallLabels) {
    const input = fabInputFromDims(dims, wallLabel, actuals, verifiedAt);
    if (input.shelves.length === 0) continue;
    const section = await buildSectionSheet({
      input,
      projectName: proposal.title,
      sheetNo: ++sheetNo,
      sheetCount,
    });
    if (section) {
      sheets.push({ wallLabel, kind: section.kind, caption: section.caption, mimeType: section.mimeType, dataBase64: section.dataBase64, verified: input.verified });
    }
    const cutlist = await buildCutListSheet({
      input,
      projectName: proposal.title,
      sheetNo: ++sheetNo,
      sheetCount,
    });
    if (cutlist) {
      sheets.push({ wallLabel, kind: cutlist.kind, caption: cutlist.caption, mimeType: cutlist.mimeType, dataBase64: cutlist.dataBase64, verified: input.verified });
    }
  }

  return NextResponse.json({ proposalId: proposal.id, title: proposal.title, sheets });
}
