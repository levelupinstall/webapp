import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getAdminSession } from "@/lib/admin-auth";
import { getWorkProposalById } from "@/lib/client-portal-store";
import { emptyPlannerVisualSpec } from "@/lib/planner-visual-spec";
import { buildShopDrawingElevation } from "@/lib/planner-shop-drawing";
import {
  fabInputFromDims,
  buildSectionSheet,
  buildCutListSheet,
  type FabWallInput,
} from "@/lib/planner-fabrication";

const PAGE_W = 1600;
const PAGE_H = 1100;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function coverSvg(opts: {
  project: string;
  date: string;
  status: string;
  walls: Array<{ label: string; sheets: string[]; verified: boolean }>;
}): string {
  const rows = opts.walls
    .map(
      (w, i) =>
        `<text x="150" y="${300 + i * 64}" font-family="sans-serif" font-size="17" font-weight="bold" fill="#1a1a1a">${esc(w.label.toUpperCase())} ${w.verified ? "✓" : ""}</text>` +
        `<text x="150" y="${326 + i * 64}" font-family="sans-serif" font-size="13" fill="#444444">${w.sheets
          .map((s, j) => `Sheet ${i * 3 + j + 2} — ${esc(s)}`)
          .join("   ·   ")}</text>`,
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>
<text x="150" y="140" font-family="sans-serif" font-size="22" font-weight="bold" fill="#1a1a1a" letter-spacing="4">LEVEL UP INSTALL</text>
<text x="150" y="210" font-family="sans-serif" font-size="44" font-weight="bold" fill="#1a1a1a" letter-spacing="2">FABRICATION PACKAGE</text>
<text x="150" y="248" font-family="sans-serif" font-size="18" fill="#444444">${esc(opts.project)} — ${esc(opts.date)}</text>
<text x="150" y="276" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1a1a1a" letter-spacing="1">${esc(opts.status)}</text>
<line x1="150" y1="296" x2="1450" y2="296" stroke="#1a1a1a" stroke-width="2"/>
${rows}
<text x="150" y="${340 + opts.walls.length * 64}" font-family="sans-serif" font-size="13" fill="#1a1a1a">CONTENTS — ${opts.walls.length * 3 + 1} SHEETS TOTAL (INCLUDING THIS COVER)</text>
<text x="150" y="${PAGE_H - 160}" font-family="sans-serif" font-size="12.5" fill="#1a1a1a">1. ALL JOB-SITE DIMENSIONS TO BE VERIFIED ON SITE BEFORE FABRICATION.</text>
<text x="150" y="${PAGE_H - 136}" font-family="sans-serif" font-size="12.5" fill="#1a1a1a">2. DIMENSIONS MARKED * OR TYP ARE SHOP STANDARD — CONFIRM ON SITE.</text>
<text x="150" y="${PAGE_H - 112}" font-family="sans-serif" font-size="12.5" fill="#1a1a1a">3. FINISHES AND MATERIALS PER APPROVED PROPOSAL.</text>
<text x="150" y="${PAGE_H - 88}" font-family="sans-serif" font-size="12.5" fill="#1a1a1a">4. DO NOT SCALE DRAWINGS — USE WRITTEN DIMENSIONS ONLY.</text>
</svg>`;
}

async function svgToPngBuffer(svg: string): Promise<Buffer | null> {
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: (input: Buffer) => { png: () => { toBuffer: () => Promise<Buffer> } };
    };
    const fn = typeof mod === "function" ? mod : mod.default;
    if (typeof fn !== "function") return null;
    return await fn(Buffer.from(svg)).png().toBuffer();
  } catch {
    return null;
  }
}

function specFromFab(input: FabWallInput) {
  const spec = emptyPlannerVisualSpec();
  spec.width = input.widthIn;
  spec.height = input.heightIn;
  spec.depth = input.depthIn;
  spec.shelfCount = input.shelves.length;
  const lengths = input.shelves.map((s) => s.lengthIn);
  spec.shelfBoardSpanAlongWallIn = lengths.length ? Math.max(...lengths) : null;
  return spec;
}

/**
 * Full fabrication package as one PDF (admin-only). Per wall: dimensioned
 * elevation, typical section, cut list — plus a cover sheet with the index.
 * Built for sending to fabricators and installers.
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
  const wallLabels = [...new Set(dims.map((d) => d.wallLabel))].filter((wl) =>
    fabInputFromDims(dims, wl).shelves.length > 0,
  );
  if (wallLabels.length === 0) {
    return NextResponse.json(
      { error: "No shop-drawing dimensions on this proposal yet." },
      { status: 422 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const sheetCount = wallLabels.length * 3;
  const actuals = proposal.siteMeasure?.actuals;
  const verifiedAt = proposal.siteMeasure?.verifiedAt;

  // Generate all sheets (3 per wall) in parallel.
  const perWall = await Promise.all(
    wallLabels.map(async (wallLabel) => {
      const input = fabInputFromDims(dims, wallLabel, actuals, verifiedAt);
      const spec = specFromFab(input);
      const heights = input.shelves
        .slice()
        .sort((a, b) => a.heightIn - b.heightIn)
        .map((s) => s.heightIn);
      const mySheets: Array<{ png: Buffer; caption: string }> = [];
      const baseNo = wallLabels.indexOf(wallLabel) * 3;
      const [elev, section, cutlist] = await Promise.all([
        buildShopDrawingElevation({
          wallLabel,
          spec,
          projectName: proposal.title,
          sheetNo: baseNo + 1,
          sheetCount: sheetCount + 1, // +1 for cover
          shelfHeightsIn: heights,
          verified: input.verified,
        }),
        buildSectionSheet({
          input,
          projectName: proposal.title,
          sheetNo: baseNo + 2,
          sheetCount: sheetCount + 1,
        }),
        buildCutListSheet({
          input,
          projectName: proposal.title,
          sheetNo: baseNo + 3,
          sheetCount: sheetCount + 1,
        }),
      ]);
      if (elev) {
        mySheets.push({
          png: Buffer.from(elev.dataBase64, "base64"),
          caption: `Shop drawing — ${wallLabel}`,
        });
      }
      for (const s of [section, cutlist]) {
        if (s) mySheets.push({ png: Buffer.from(s.dataBase64, "base64"), caption: s.caption });
      }
      return { wallLabel, sheets: mySheets, verified: input.verified };
    }),
  );

  const allVerified = perWall.length > 0 && perWall.every((w) => w.verified);
  const coverPng = await svgToPngBuffer(
    coverSvg({
      project: proposal.title,
      date: today,
      status: allVerified
        ? `VERIFIED AGAINST SITE MEASURE ${verifiedAt?.slice(0, 10) ?? ""}`.trim()
        : "PRELIMINARY — VERIFY ALL DIMENSIONS ON SITE BEFORE FABRICATION",
      walls: perWall.map((w) => ({
        label: w.wallLabel,
        sheets: ["Elevation", "Section", "Cut list"],
        verified: w.verified,
      })),
    }),
  );
  if (!coverPng) {
    return NextResponse.json({ error: "Cover generation failed." }, { status: 500 });
  }

  const pdf = await PDFDocument.create();
  const ptW = 792; // 11in landscape
  const ptH = (ptW * PAGE_H) / PAGE_W;
  const addPage = async (png: Buffer) => {
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([ptW, ptH]);
    page.drawImage(img, { x: 0, y: 0, width: ptW, height: ptH });
  };
  await addPage(coverPng);
  for (const w of perWall) {
    for (const s of w.sheets) await addPage(s.png);
  }
  const bytes = await pdf.save();

  const filename = `fabrication-${proposal.id.slice(0, 8)}-${today}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
