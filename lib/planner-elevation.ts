/**
 * Deterministic front-elevation shop drawing for planner sessions.
 *
 * Companion to lib/planner-floor-plan.ts (top-down). This draws the
 * straight-on view of ONE wall: the millwork to proportional scale with
 * architectural dimension lines (overall width, heights from floor, spans).
 *
 * For the HOMEOWNER (approval) and later the SITE MEASURE (verification).
 * Dimensions come from the extracted spec; anything unknown is marked
 * "verify on site" — never invented.
 *
 * SVG -> PNG via sharp, same pattern as the other code-drawn guides.
 */

import type { PlannerVisualSpec } from "@/lib/planner-visual-spec";

export type ElevationResult = {
  mimeType: "image/png";
  dataBase64: string;
  /** Dimensions shown on the drawing, for the proposal checklist + site measure. */
  dimensions: Array<{
    name: string;
    expectedIn: number;
    known: boolean;
  }>;
};

const W = 1024;
const H = 768;

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

function fmtIn(inches: number): string {
  const r = Math.round(inches * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}"`;
}

/** Architectural tick at (x,y) for a horizontal dimension line. */
function tickH(x: number, y: number, c: string): string {
  return `<line x1="${(x - 5).toFixed(1)}" y1="${(y + 5).toFixed(1)}" x2="${(x + 5).toFixed(1)}" y2="${(y - 5).toFixed(1)}" stroke="${c}" stroke-width="2"/>`;
}

/** Architectural tick at (x,y) for a vertical dimension line. */
function tickV(x: number, y: number, c: string): string {
  return `<line x1="${(x - 5).toFixed(1)}" y1="${(y + 5).toFixed(1)}" x2="${(x + 5).toFixed(1)}" y2="${(y - 5).toFixed(1)}" stroke="${c}" stroke-width="2"/>`;
}

export async function buildPlannerElevation(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  roomType?: string | null;
}): Promise<ElevationResult | null> {
  const spec = params.spec;
  const label = params.wallLabel.trim() || "wall";

  // Wall size: spec width/height, else sensible defaults. Never invent —
  // unknown dims are flagged on the drawing.
  const wallWIn = spec.width ?? 96;
  const wallHIn = spec.height ?? 96;
  const widthKnown = spec.width !== null;
  const heightKnown = spec.height !== null;

  // Layout: margins leave room for dims (top/left) and title (bottom).
  const mTop = 110;
  const mLeft = 130;
  const mRight = 60;
  const mBottom = 120;
  const drawW = W - mLeft - mRight;
  const drawH = H - mTop - mBottom;
  const pxPerIn = Math.min(drawW / wallWIn, drawH / wallHIn);
  const wallPxW = wallWIn * pxPerIn;
  const wallPxH = wallHIn * pxPerIn;
  const wx0 = mLeft + (drawW - wallPxW) / 2;
  const wy0 = mTop + (drawH - wallPxH) / 2; // top of wall
  const wy1 = wy0 + wallPxH; // floor line

  const ink = "#31184a";
  const dimC = "#6a4a8f";
  const millFill = "#b794e6";
  const millStroke = "#6e3eb2";

  const dimensions: ElevationResult["dimensions"] = [];
  dimensions.push({
    name: "Wall width",
    expectedIn: Math.round(wallWIn * 10) / 10,
    known: widthKnown,
  });
  dimensions.push({
    name: "Wall height",
    expectedIn: Math.round(wallHIn * 10) / 10,
    known: heightKnown,
  });

  const svg: string[] = [];
  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#faf8ff"/>`,
    `<text x="${W / 2}" y="36" font-family="sans-serif" font-size="24" font-weight="bold" fill="${ink}" text-anchor="middle">ELEVATION — ${esc(label).toUpperCase()}</text>`,
    `<text x="${W / 2}" y="60" font-family="sans-serif" font-size="14" fill="${dimC}" text-anchor="middle">PRELIMINARY — verify all dimensions on site before ordering</text>`,
  );

  // Wall outline + floor line.
  svg.push(
    `<rect x="${wx0.toFixed(1)}" y="${wy0.toFixed(1)}" width="${wallPxW.toFixed(1)}" height="${wallPxH.toFixed(1)}" fill="#ffffff" stroke="${ink}" stroke-width="3"/>`,
    `<line x1="${(wx0 - 30).toFixed(1)}" y1="${wy1.toFixed(1)}" x2="${(wx0 + wallPxW + 30).toFixed(1)}" y2="${wy1.toFixed(1)}" stroke="${ink}" stroke-width="4"/>`,
    `<text x="${(wx0 - 38).toFixed(1)}" y="${(wy1 + 6).toFixed(1)}" font-family="sans-serif" font-size="14" fill="${dimC}" text-anchor="end">floor</text>`,
  );

  // ---- Millwork ----
  const shelfCount = spec.shelfCount ?? 0;
  const spanIn = spec.shelfBoardSpanAlongWallIn ?? Math.min(wallWIn * 0.55, 48);
  const spacingIn = spec.shelfVerticalSpacingIn ?? null;

  type ShelfDraw = { x: number; y: number; lenPx: number; hFromFloorIn: number; lenIn: number };
  const shelves: ShelfDraw[] = [];

  if (shelfCount > 0 && shelfCount <= 12) {
    const n = Math.round(shelfCount);
    const lenPx = Math.min(spanIn * pxPerIn, wallPxW * 0.94);
    const lenIn = Math.min(spanIn, wallWIn);
    const shelfX = wx0 + (wallPxW - lenPx) / 2;
    // Vertical placement: bottom shelf ~48" from floor default, or distribute.
    let ysIn: number[];
    if (spacingIn !== null && spacingIn > 0 && n > 1) {
      const baseIn = 48;
      ysIn = Array.from({ length: n }, (_, i) => baseIn + i * spacingIn);
    } else if (n === 1) {
      ysIn = [60];
    } else {
      const zoneTopIn = wallHIn * 0.25;
      const zoneBotIn = wallHIn * 0.7;
      ysIn = Array.from(
        { length: n },
        (_, i) => zoneBotIn - (i * (zoneBotIn - zoneTopIn)) / (n - 1),
      );
    }
    const thickPx = Math.max(7, 1.5 * pxPerIn);
    for (const hIn of ysIn) {
      const y = wy1 - hIn * pxPerIn;
      if (y < wy0 + 6 || y > wy1 - 6) continue; // keep inside wall
      svg.push(
        `<rect x="${shelfX.toFixed(1)}" y="${(y - thickPx / 2).toFixed(1)}" width="${lenPx.toFixed(1)}" height="${thickPx.toFixed(1)}" fill="${millFill}" stroke="${millStroke}" stroke-width="2"/>`,
      );
      shelves.push({ x: shelfX, y, lenPx, hFromFloorIn: hIn, lenIn });
    }
  } else {
    // Generic millwork band when no shelf count (e.g. cabinets w/o counts).
    const bandH = Math.min(wallPxH * 0.3, 120);
    svg.push(
      `<rect x="${(wx0 + wallPxW * 0.08).toFixed(1)}" y="${(wy1 - bandH - wallPxH * 0.12).toFixed(1)}" width="${(wallPxW * 0.84).toFixed(1)}" height="${bandH.toFixed(1)}" fill="${millFill}" fill-opacity="0.5" stroke="${millStroke}" stroke-width="2" stroke-dasharray="8 5"/>`,
      `<text x="${(wx0 + wallPxW / 2).toFixed(1)}" y="${(wy1 - bandH / 2 + 5).toFixed(1)}" font-family="sans-serif" font-size="15" fill="${ink}" text-anchor="middle">millwork (per design)</text>`,
    );
  }

  // ---- Dimensions ----
  // Top: overall wall width.
  const dimTopY = wy0 - 52;
  svg.push(
    `<line x1="${wx0.toFixed(1)}" y1="${(wy0 - 8).toFixed(1)}" x2="${wx0.toFixed(1)}" y2="${(dimTopY - 6).toFixed(1)}" stroke="${dimC}" stroke-width="1"/>`,
    `<line x1="${(wx0 + wallPxW).toFixed(1)}" y1="${(wy0 - 8).toFixed(1)}" x2="${(wx0 + wallPxW).toFixed(1)}" y2="${(dimTopY - 6).toFixed(1)}" stroke="${dimC}" stroke-width="1"/>`,
    `<line x1="${wx0.toFixed(1)}" y1="${dimTopY.toFixed(1)}" x2="${(wx0 + wallPxW).toFixed(1)}" y2="${dimTopY.toFixed(1)}" stroke="${dimC}" stroke-width="1.5"/>`,
    tickH(wx0, dimTopY, dimC),
    tickH(wx0 + wallPxW, dimTopY, dimC),
    `<text x="${(wx0 + wallPxW / 2).toFixed(1)}" y="${(dimTopY + 22).toFixed(1)}" font-family="monospace" font-size="16" font-weight="bold" fill="${ink}" text-anchor="middle">${widthKnown ? fmtIn(wallWIn) : fmtIn(wallWIn) + " ?"}</text>`,
  );

  // Right: overall wall height (keeps left side clear for per-shelf heights).
  const dimRightX = wx0 + wallPxW + 44;
  svg.push(
    `<line x1="${(wx0 + wallPxW + 8).toFixed(1)}" y1="${wy0.toFixed(1)}" x2="${(dimRightX - 8).toFixed(1)}" y2="${wy0.toFixed(1)}" stroke="${dimC}" stroke-width="1"/>`,
    `<line x1="${(wx0 + wallPxW + 8).toFixed(1)}" y1="${wy1.toFixed(1)}" x2="${(dimRightX - 8).toFixed(1)}" y2="${wy1.toFixed(1)}" stroke="${dimC}" stroke-width="1"/>`,
    `<line x1="${dimRightX.toFixed(1)}" y1="${wy0.toFixed(1)}" x2="${dimRightX.toFixed(1)}" y2="${wy1.toFixed(1)}" stroke="${dimC}" stroke-width="1.5"/>`,
    tickV(dimRightX, wy0, dimC),
    tickV(dimRightX, wy1, dimC),
    `<text x="${(dimRightX + 22).toFixed(1)}" y="${((wy0 + wy1) / 2).toFixed(1)}" font-family="monospace" font-size="16" font-weight="bold" fill="${ink}" text-anchor="middle" transform="rotate(-90 ${(dimRightX + 22).toFixed(1)} ${((wy0 + wy1) / 2).toFixed(1)})">${heightKnown ? fmtIn(wallHIn) : fmtIn(wallHIn) + " ?"}</text>`,
  );

  // Per-shelf: height from floor (left, staggered) + length below shelf.
  shelves.forEach((s, i) => {
    dimensions.push({
      name: `Shelf ${i + 1} height from floor`,
      expectedIn: Math.round(s.hFromFloorIn * 10) / 10,
      known: true,
    });
    dimensions.push({
      name: `Shelf ${i + 1} length`,
      expectedIn: Math.round(s.lenIn * 10) / 10,
      known: true,
    });
  });
  if (spec.depth !== null) {
    dimensions.push({
      name: "Millwork depth",
      expectedIn: Math.round(spec.depth * 10) / 10,
      known: true,
    });
  }
  shelves.forEach((s, i) => {
    const hy = s.y;
    const dimX = wx0 - 88 - (i % 2) * 0; // single column
    // extension from shelf to dim line
    svg.push(
      `<line x1="${s.x.toFixed(1)}" y1="${hy.toFixed(1)}" x2="${dimX.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${dimC}" stroke-width="1" stroke-dasharray="4 3"/>`,
      `<line x1="${dimX.toFixed(1)}" y1="${hy.toFixed(1)}" x2="${dimX.toFixed(1)}" y2="${wy1.toFixed(1)}" stroke="${dimC}" stroke-width="1.5"/>`,
      tickV(dimX, hy, dimC),
      tickV(dimX, wy1, dimC),
      `<text x="${(dimX - 8).toFixed(1)}" y="${((hy + wy1) / 2).toFixed(1)}" font-family="monospace" font-size="13" fill="${ink}" text-anchor="middle" transform="rotate(-90 ${(dimX - 8).toFixed(1)} ${((hy + wy1) / 2).toFixed(1)})">${fmtIn(s.hFromFloorIn)}</text>`,
    );
    // length dim under shelf
    const ly = s.y + 26 + (i % 2) * 18;
    if (ly < wy1 - 8) {
      svg.push(
        `<line x1="${s.x.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(s.x + s.lenPx).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${dimC}" stroke-width="1.5"/>`,
        tickH(s.x, ly, dimC),
        tickH(s.x + s.lenPx, ly, dimC),
        `<text x="${(s.x + s.lenPx / 2).toFixed(1)}" y="${(ly - 6).toFixed(1)}" font-family="monospace" font-size="13" fill="${ink}" text-anchor="middle">${fmtIn(s.lenIn)}</text>`,
      );
    }
  });

  // Spacing note between first two shelves (left of wall, clear of dims).
  if (shelves.length >= 2 && spacingIn !== null) {
    svg.push(
      `<text x="${(wx0 - 8).toFixed(1)}" y="${((shelves[0].y + shelves[1].y) / 2).toFixed(1)}" font-family="sans-serif" font-size="13" fill="${dimC}" text-anchor="end">typ. ${fmtIn(spacingIn)} o.c.</text>`,
    );
  }

  // Title block / legend.
  const tbY = H - 52;
  const depthNote =
    spec.depth !== null ? `${fmtIn(spec.depth)} deep` : `depth verify on site`;
  const finishNote = spec.style ? ` · ${esc(spec.style)}` : "";
  svg.push(
    `<text x="${mLeft}" y="${tbY.toFixed(1)}" font-family="sans-serif" font-size="14" fill="${ink}">Scale: proportional · ${depthNote}${finishNote}</text>`,
    `<text x="${W - mRight}" y="${tbY.toFixed(1)}" font-family="sans-serif" font-size="14" fill="${dimC}" text-anchor="end">"?" = confirm on site</text>`,
  );

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
