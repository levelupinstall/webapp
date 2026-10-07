/**
 * Shop-drawing elevation in a fabrication-drafting style (v2).
 *
 * Monochrome orthographic elevation with fractional-inch dimension chains,
 * part tags with leader lines, general notes, and a title block — modeled on
 * real millwork shop drawings. Generated deterministically from the planner
 * spec; anything not known is flagged for the site measure, never invented.
 *
 * Pairs with the site-measure checklist: `dimensions` feeds the proposal's
 * shopDrawingDims (expected vs actual verification after deposit).
 */

import type { PlannerVisualSpec } from "@/lib/planner-visual-spec";

export type ShopDrawingDimension = {
  name: string;
  expectedIn: number;
  known: boolean;
};

export type ShopDrawingResult = {
  mimeType: "image/png";
  dataBase64: string;
  dimensions: ShopDrawingDimension[];
};

const W = 1600;
const H = 1100;

type SharpLike = (input: Buffer) => {
  png: () => { toBuffer: () => Promise<Buffer> };
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Decimal inches -> fractional string to nearest 1/16, e.g. 19.9375 -> `19 15/16"` */
export function fmtFractional(inches: number): string {
  const sign = inches < 0 ? "-" : "";
  const abs = Math.abs(inches);
  let whole = Math.floor(abs + 1e-9);
  let sixteenths = Math.round((abs - whole) * 16);
  if (sixteenths === 16) {
    whole += 1;
    sixteenths = 0;
  }
  if (sixteenths === 0) return `${sign}${whole}"`;
  // reduce fraction
  let n = sixteenths;
  let d = 16;
  while (n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return whole === 0 ? `${sign}${n}/${d}"` : `${sign}${whole} ${n}/${d}"`;
}

const INK = "#1a1a1a";
const DIM = "#444444";
const MILL_FILL = "#e9e9e9";
const MILL_EDGE = "#1a1a1a";
const TAG_FILL = "#ffffff";

function tickH(x: number, y: number): string {
  return `<line x1="${(x - 6).toFixed(1)}" y1="${(y + 6).toFixed(1)}" x2="${(x + 6).toFixed(1)}" y2="${(y - 6).toFixed(1)}" stroke="${DIM}" stroke-width="2"/>`;
}
function tickV(x: number, y: number): string {
  return `<line x1="${(x - 6).toFixed(1)}" y1="${(y + 6).toFixed(1)}" x2="${(x + 6).toFixed(1)}" y2="${(y - 6).toFixed(1)}" stroke="${DIM}" stroke-width="2"/>`;
}

export async function buildShopDrawingElevation(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  projectName?: string;
  sheetNo?: number;
  sheetCount?: number;
  /**
   * Explicit A.F.F. shelf heights (inches, bottom-up). When provided, overrides
   * the spec-derived positioning so regenerated drawings match the stored
   * dimension checklist exactly (used by the fabrication PDF).
   */
  shelfHeightsIn?: number[];
}): Promise<ShopDrawingResult | null> {
  const spec = params.spec;
  const label = (params.wallLabel || "wall").trim();
  const project = (params.projectName || "RESIDENTIAL MILLWORK").trim().toUpperCase();

  const wallWIn = spec.width ?? 96;
  const wallHIn = spec.height ?? 96;
  const widthKnown = spec.width !== null;
  const heightKnown = spec.height !== null;

  // Sheet layout: drawing area + tag column + title block column.
  const titleW = 380;
  const tagColW = 140;
  const mTop = 150;
  const mLeft = 150;
  const mRight = titleW + 60 + tagColW;
  const mBottom = 130;
  const drawW = W - mLeft - mRight;
  const drawH = H - mTop - mBottom;
  const pxPerIn = Math.min(drawW / wallWIn, drawH / wallHIn);
  const wallPxW = wallWIn * pxPerIn;
  const wallPxH = wallHIn * pxPerIn;
  const wx0 = mLeft + (drawW - wallPxW) / 2;
  const wy0 = mTop + (drawH - wallPxH) / 2;
  const wy1 = wy0 + wallPxH;
  const wx1 = wx0 + wallPxW;

  const dimensions: ShopDrawingDimension[] = [];
  dimensions.push({ name: "Wall width", expectedIn: r1(wallWIn), known: widthKnown });
  dimensions.push({ name: "Wall height", expectedIn: r1(wallHIn), known: heightKnown });

  const svg: string[] = [];
  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${mLeft}" y="44" font-family="sans-serif" font-size="26" font-weight="bold" fill="${INK}" letter-spacing="2">ELEVATION — ${esc(label).toUpperCase()}</text>`,
    `<text x="${mLeft}" y="68" font-family="sans-serif" font-size="13" fill="${DIM}" letter-spacing="1">SHOP DRAWING — PRELIMINARY · VERIFY ALL DIMENSIONS ON SITE BEFORE FABRICATION</text>`,
  );

  // Wall outline + floor.
  svg.push(
    `<rect x="${f1(wx0)}" y="${f1(wy0)}" width="${f1(wallPxW)}" height="${f1(wallPxH)}" fill="#ffffff" stroke="${INK}" stroke-width="3"/>`,
    `<line x1="${f1(wx0 - 40)}" y1="${f1(wy1)}" x2="${f1(wx1 + 40)}" y2="${f1(wy1)}" stroke="${INK}" stroke-width="4"/>`,
    `<text x="${f1(wx0 - 8)}" y="${f1(wy1 + 22)}" font-family="sans-serif" font-size="13" fill="${DIM}" text-anchor="end">F.F.</text>`,
  );

  // ---- Millwork: shelves ----
  const shelfCount = spec.shelfCount ?? 0;
  const spanIn = spec.shelfBoardSpanAlongWallIn ?? Math.min(wallWIn * 0.55, 48);
  const spacingIn = spec.shelfVerticalSpacingIn ?? null;
  type Shelf = { x: number; y: number; lenPx: number; hIn: number; lenIn: number; tag: string };
  const shelves: Shelf[] = [];

  if (shelfCount > 0 && shelfCount <= 12) {
    const n = Math.round(shelfCount);
    const lenIn = Math.min(spanIn, wallWIn);
    const lenPx = lenIn * pxPerIn;
    const shelfX = wx0 + (wallPxW - lenPx) / 2;
    let ysIn: number[];
    if (spacingIn !== null && spacingIn > 0 && n > 1) {
      const baseIn = 48;
      ysIn = Array.from({ length: n }, (_, i) => baseIn + i * spacingIn);
    } else if (n === 1) {
      ysIn = [60];
    } else {
      const zTop = wallHIn * 0.25;
      const zBot = wallHIn * 0.7;
      ysIn = Array.from({ length: n }, (_, i) => zBot - (i * (zBot - zTop)) / (n - 1));
    }
    const thickPx = Math.max(9, 1.5 * pxPerIn);
    let si = 0;
    const explicitHeights = (params.shelfHeightsIn ?? []).filter(
      (h) => Number.isFinite(h) && h > 0,
    );
    const heightsIn =
      explicitHeights.length === ysIn.length ? explicitHeights : ysIn;
    for (const hIn of heightsIn) {
      const y = wy1 - hIn * pxPerIn;
      if (y < wy0 + 8 || y > wy1 - 8) continue;
      si += 1;
      const tag = `SH-${si}`;
      // shelf board in section (hatched ends suggest thickness)
      svg.push(
        `<rect x="${f1(shelfX)}" y="${f1(y - thickPx / 2)}" width="${f1(lenPx)}" height="${f1(thickPx)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
        `<line x1="${f1(shelfX + 6)}" y1="${f1(y - thickPx / 2 + 3)}" x2="${f1(shelfX + 6)}" y2="${f1(y + thickPx / 2 - 3)}" stroke="${MILL_EDGE}" stroke-width="1"/>`,
        `<line x1="${f1(shelfX + lenPx - 6)}" y1="${f1(y - thickPx / 2 + 3)}" x2="${f1(shelfX + lenPx - 6)}" y2="${f1(y + thickPx / 2 - 3)}" stroke="${MILL_EDGE}" stroke-width="1"/>`,
      );
      shelves.push({ x: shelfX, y, lenPx, hIn, lenIn, tag });
      dimensions.push({ name: `Shelf ${si} height A.F.F.`, expectedIn: r1(hIn), known: true });
      dimensions.push({ name: `Shelf ${si} length (${tag})`, expectedIn: r1(lenIn), known: true });
    }
    // Part tags with leaders in the dedicated tag column (right of wall, left of title block).
    shelves.forEach((s) => {
      const tx = wx1 + tagColW / 2;
      const ty = s.y;
      svg.push(
        `<line x1="${f1(s.x + s.lenPx)}" y1="${f1(s.y)}" x2="${f1(tx - 34)}" y2="${f1(ty)}" stroke="${DIM}" stroke-width="1.25"/>`,
        `<circle cx="${f1(tx)}" cy="${f1(ty)}" r="20" fill="${TAG_FILL}" stroke="${INK}" stroke-width="2"/>`,
        `<text x="${f1(tx)}" y="${f1(ty + 5)}" font-family="monospace" font-size="14" font-weight="bold" fill="${INK}" text-anchor="middle">${s.tag}</text>`,
      );
    });
  } else {
    const bandH = Math.min(wallPxH * 0.3, 130);
    svg.push(
      `<rect x="${f1(wx0 + wallPxW * 0.08)}" y="${f1(wy1 - bandH - wallPxH * 0.12)}" width="${f1(wallPxW * 0.84)}" height="${f1(bandH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2" stroke-dasharray="10 6"/>`,
      `<text x="${f1(wx0 + wallPxW / 2)}" y="${f1(wy1 - bandH / 2 + 5)}" font-family="sans-serif" font-size="15" fill="${INK}" text-anchor="middle">MILLWORK — PER APPROVED DESIGN</text>`,
    );
  }
  if (spec.depth !== null) {
    dimensions.push({ name: "Millwork depth", expectedIn: r1(spec.depth), known: true });
  }

  // ---- Dimension chains ----
  // Top: overall width + segment chain (shelf span + side gaps).
  const topY = wy0 - 46;
  const chainY = wy0 - 92;
  svg.push(
    `<line x1="${f1(wx0)}" y1="${f1(wy0 - 10)}" x2="${f1(wx0)}" y2="${f1(topY - 8)}" stroke="${DIM}" stroke-width="1"/>`,
    `<line x1="${f1(wx1)}" y1="${f1(wy0 - 10)}" x2="${f1(wx1)}" y2="${f1(topY - 8)}" stroke="${DIM}" stroke-width="1"/>`,
    `<line x1="${f1(wx0)}" y1="${f1(topY)}" x2="${f1(wx1)}" y2="${f1(topY)}" stroke="${DIM}" stroke-width="1.5"/>`,
    tickH(wx0, topY),
    tickH(wx1, topY),
    dimLabel((wx0 + wx1) / 2, topY - 10, fmtFractional(wallWIn) + (widthKnown ? "" : " *"), 17, true),
  );
  if (shelves.length > 0) {
    const s0 = shelves[0];
    const gapL = (s0.x - wx0) / pxPerIn;
    const gapR = (wx1 - (s0.x + s0.lenPx)) / pxPerIn;
    const pts = [wx0, s0.x, s0.x + s0.lenPx, wx1];
    const vals = [gapL, s0.lenIn, gapR];
    svg.push(
      `<line x1="${f1(wx0)}" y1="${f1(chainY)}" x2="${f1(wx1)}" y2="${f1(chainY)}" stroke="${DIM}" stroke-width="1.25"/>`,
    );
    pts.forEach((px) => {
      svg.push(
        `<line x1="${f1(px)}" y1="${f1(topY - 6)}" x2="${f1(px)}" y2="${f1(chainY + 8)}" stroke="${DIM}" stroke-width="1"/>`,
        tickH(px, chainY),
      );
    });
    const segs: Array<[number, number]> = [
      [(pts[0] + pts[1]) / 2, vals[0]],
      [(pts[1] + pts[2]) / 2, vals[1]],
      [(pts[2] + pts[3]) / 2, vals[2]],
    ];
    for (const [cx, v] of segs) {
      if (v >= 1) svg.push(dimLabel(cx, chainY - 9, fmtFractional(v), 13, false));
    }
  }

  // Left: overall height chain + per-shelf A.F.F. dims.
  const leftX = wx0 - 56;
  const leftChainX = wx0 - 118;
  svg.push(
    `<line x1="${f1(wx0 - 10)}" y1="${f1(wy0)}" x2="${f1(leftX + 8)}" y2="${f1(wy0)}" stroke="${DIM}" stroke-width="1"/>`,
    `<line x1="${f1(wx0 - 10)}" y1="${f1(wy1)}" x2="${f1(leftX + 8)}" y2="${f1(wy1)}" stroke="${DIM}" stroke-width="1"/>`,
    `<line x1="${f1(leftX)}" y1="${f1(wy0)}" x2="${f1(leftX)}" y2="${f1(wy1)}" stroke="${DIM}" stroke-width="1.5"/>`,
    tickV(leftX, wy0),
    tickV(leftX, wy1),
    dimLabelV(leftX - 12, (wy0 + wy1) / 2, fmtFractional(wallHIn) + (heightKnown ? "" : " *"), 17, true),
  );
  // Per-shelf heights as a running chain on the outer column (bottom-up).
  const sortedShelves = shelves.slice().sort((a, b) => b.y - a.y);
  if (sortedShelves.length > 0) {
    svg.push(
      `<line x1="${f1(leftChainX)}" y1="${f1(sortedShelves[0].y)}" x2="${f1(leftChainX)}" y2="${f1(wy1)}" stroke="${DIM}" stroke-width="1.25"/>`,
    );
    for (const s of sortedShelves) tickV(leftChainX, s.y);
    tickV(leftChainX, wy1);
    sortedShelves.forEach((s, i) => {
      const belowY = i === 0 ? wy1 : sortedShelves[i - 1].y;
      svg.push(
        `<line x1="${f1(s.x - 4)}" y1="${f1(s.y)}" x2="${f1(leftChainX - 8)}" y2="${f1(s.y)}" stroke="${DIM}" stroke-width="1" stroke-dasharray="5 4"/>`,
        dimLabelV(leftChainX - 12, (s.y + belowY) / 2, fmtFractional(s.hIn), 12, false),
      );
    });
  }

  // ---- Title block (right column) ----
  const tbX = W - titleW - 30;
  const tbY = 90;
  const tbW = titleW;
  const rowH = 44;
  const today = new Date().toISOString().slice(0, 10);
  const finishNote = spec.style ? spec.style.toUpperCase().slice(0, 34) : "PER APPROVED DESIGN";
  const rows: Array<[string, string]> = [
    ["PROJECT", esc(project)],
    ["PART", `ELEVATION — ${esc(label).toUpperCase()}`],
    ["FINISH", esc(finishNote)],
    ["SCALE", "N.T.S. — DO NOT SCALE DRAWING"],
    ["DRAWN", "LEVEL UP INSTALL"],
    ["DATE", today],
    ["SHEET", `${params.sheetNo ?? 1} OF ${params.sheetCount ?? 1}`],
  ];
  svg.push(`<rect x="${tbX}" y="${tbY}" width="${tbW}" height="${rowH * rows.length + 64}" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`);
  svg.push(
    `<text x="${tbX + 14}" y="${tbY + 40}" font-family="sans-serif" font-size="20" font-weight="bold" fill="${INK}" letter-spacing="3">LEVEL UP INSTALL</text>`,
  );
  rows.forEach(([k, v], i) => {
    const ry = tbY + 64 + i * rowH;
    svg.push(
      `<line x1="${tbX}" y1="${ry}" x2="${tbX + tbW}" y2="${ry}" stroke="${INK}" stroke-width="1"/>`,
      `<text x="${tbX + 12}" y="${ry + 18}" font-family="sans-serif" font-size="11" fill="${DIM}" letter-spacing="1">${k}</text>`,
      `<text x="${tbX + 12}" y="${ry + 36}" font-family="sans-serif" font-size="13" font-weight="bold" fill="${INK}">${v}</text>`,
    );
  });

  // ---- General notes (bottom-left) ----
  const notesY = H - 96;
  const notes = [
    "1. ALL JOB-SITE DIMENSIONS TO BE VERIFIED ON SITE BEFORE FABRICATION.",
    `2. DIMENSIONS MARKED * ARE ASSUMED — CONFIRM ON SITE.`,
    "3. FINISHES AND MATERIALS PER APPROVED PROPOSAL.",
    "4. DO NOT SCALE DRAWING — USE WRITTEN DIMENSIONS ONLY.",
  ];
  notes.forEach((n, i) => {
    svg.push(
      `<text x="${mLeft}" y="${notesY + i * 20}" font-family="sans-serif" font-size="12.5" fill="${INK}">${esc(n)}</text>`,
    );
  });

  svg.push(`</svg>`);

  let png: Buffer;
  try {
    const mod = (await import("sharp")) as unknown as
      | { default: SharpLike }
      | SharpLike;
    const sharpFn: SharpLike | undefined =
      typeof mod === "function" ? mod : mod.default;
    if (typeof sharpFn !== "function") return null;
    png = await sharpFn(Buffer.from(svg.join("\n"))).png().toBuffer();
  } catch {
    return null;
  }

  return { mimeType: "image/png", dataBase64: png.toString("base64"), dimensions };
}

function r1(n: number): number {
  return Math.round(n * 16) / 16;
}
function f1(n: number): string {
  return n.toFixed(1);
}
function dimLabel(x: number, y: number, text: string, size: number, bold: boolean): string {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="monospace" font-size="${size}" ${bold ? 'font-weight="bold"' : ""} fill="${INK}" text-anchor="middle">${esc(text)}</text>`;
}
function dimLabelV(x: number, y: number, text: string, size: number, bold: boolean): string {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="monospace" font-size="${size}" ${bold ? 'font-weight="bold"' : ""} fill="${INK}" text-anchor="middle" transform="rotate(-90 ${f1(x)} ${f1(y)})">${esc(text)}</text>`;
}
