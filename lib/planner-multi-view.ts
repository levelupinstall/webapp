/**
 * Multi-view shop drawings: side elevation, plan view, and isometric.
 * Complements the front elevation from planner-shop-drawing.ts.
 *
 * When a parametric MillworkModel is supplied (built by the front
 * elevation from the same vision-grounded zones), every view renders
 * THAT structure — same sections, gables, base cabinets, and shelf
 * heights — so the four sheets can never disagree. Without a model the
 * views fall back to simplified generic geometry from the spec.
 */

import type { PlannerVisualSpec } from "./planner-visual-spec.js";
import type { MillworkModel } from "./planner-millwork-model";

export type DrawingView = "side" | "plan" | "isometric";

export type MultiViewResult = {
  view: DrawingView;
  mimeType: "image/png";
  dataBase64: string;
  dimensions: { name: string; expectedIn: number; known: boolean }[];
};

const MILL_FILL = "#F5F5F5";
const MILL_EDGE = "#1A1A1A";
const DIM = "#666666";
const WALL_FILL = "#E0E0E0";

function f1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

async function renderPng(svg: string[]): Promise<string> {
  const { default: sharp } = await import("sharp");
  const { ensurePlannerFonts } = await import("./planner-svg-font");
  await ensurePlannerFonts();
  const png = await sharp(Buffer.from(svg.join("\n"))).png().toBuffer();
  return png.toString("base64");
}

function titleBlock(svg: string[], W: number, margin: number, viewName: string, label: string, note: string) {
  const tbX = W - 180;
  svg.push(`<rect x="${tbX}" y="${margin}" width="160" height="120" fill="none" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 20}" font-family="sans-serif" font-size="11" font-weight="bold">LEVEL UP INSTALL</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 40}" font-family="sans-serif" font-size="9">${viewName}</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 60}" font-family="sans-serif" font-size="9">${label}</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 100}" font-family="sans-serif" font-size="9" fill="${DIM}">${note}</text>`);
}

/**
 * Side elevation: looking at the unit from the side.
 * Model path: profile of the actual unit — base block, case, the
 * fullest section's shelves/rods at their real heights, front gable.
 */
export async function buildSideElevation(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  model?: MillworkModel | null;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<MultiViewResult | null> {
  const { spec, model } = params;
  const label = (params.wallLabel || "wall").trim();

  const W = 1200;
  const H = 900;
  const margin = 80;
  const svg: string[] = [];
  const dimensions: MultiViewResult["dimensions"] = [];

  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<rect width="${W}" height="${H}" fill="white"/>`);
  svg.push(`<text x="${margin}" y="40" font-family="sans-serif" font-size="22" font-weight="bold">SIDE ELEVATION — ${label.toUpperCase()}</text>`);
  svg.push(`<text x="${margin}" y="62" font-family="sans-serif" font-size="11" fill="${DIM}">SHOP DRAWING — PRELIMINARY · VERIFY ALL DIMENSIONS ON SITE BEFORE FABRICATION</text>`);

  if (model) {
    const depthIn = model.depthIn;
    const heightIn = model.unitTopIn;
    const baseH = model.baseRuns.length ? Math.max(...model.baseRuns.map((r) => r.heightIn)) : 0;

    const availW = W - margin * 2 - 200;
    const availH = H - margin * 2 - 100;
    const pxPerIn = Math.min(availW / (depthIn + 12), availH / (heightIn + 12));
    const drawW = depthIn * pxPerIn;
    const drawH = heightIn * pxPerIn;
    const x0 = margin + 60;
    const y0 = margin + 40;
    const floorY = y0 + drawH;
    const yOf = (inAFF: number) => floorY - inAFF * pxPerIn;

    // Wall (left, hatched block)
    const wallX = x0 - 30;
    svg.push(`<rect x="${f1(wallX)}" y="${f1(y0)}" width="24" height="${f1(drawH)}" fill="${WALL_FILL}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
    svg.push(`<text x="${f1(wallX - 8)}" y="${f1(y0 + drawH / 2)}" font-family="sans-serif" font-size="10" fill="${DIM}" transform="rotate(-90 ${f1(wallX - 8)} ${f1(y0 + drawH / 2)})" text-anchor="middle">WALL</text>`);

    // Case profile (upper) and base block
    if (baseH > 0) {
      svg.push(`<rect x="${f1(x0)}" y="${f1(yOf(baseH))}" width="${f1(drawW)}" height="${f1(baseH * pxPerIn)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
      svg.push(`<text x="${f1(x0 + drawW + 10)}" y="${f1(yOf(baseH) + 14)}" font-family="sans-serif" font-size="10" fill="${DIM}">BASE ${Math.round(baseH)}"</text>`);
      svg.push(`<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(drawW)}" height="${f1(yOf(baseH) - y0)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
      dimensions.push({ name: "Base cabinet height", expectedIn: Math.round(baseH * 2) / 2, known: !model.assumed });
    } else {
      svg.push(`<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(drawW)}" height="${f1(drawH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
    }

    // Front gable in profile (¾" strip at the front edge), spanning the
    // gables' actual extent (counter to top on a hutch, floor to top on a
    // closet).
    const gableWPx = Math.max(4, 0.75 * pxPerIn);
    const gTop = model.gables.length ? Math.max(...model.gables.map((g) => g.topIn)) : heightIn;
    const gBot = model.gables.length ? Math.min(...model.gables.map((g) => g.bottomIn)) : 0;
    svg.push(`<rect x="${f1(x0 + drawW - gableWPx)}" y="${f1(yOf(gTop))}" width="${f1(gableWPx)}" height="${f1(yOf(gBot) - yOf(gTop))}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`);
    svg.push(`<text x="${f1(x0 + drawW + 10)}" y="${f1(floorY - 4)}" font-family="sans-serif" font-size="10" fill="${DIM}">GABLE</text>`);

    // Fullest section's shelves (lines) and rods (circles in profile)
    const rep = [...model.sections].sort(
      (a, b) => b.shelvesIn.length + b.rodsIn.length - (a.shelvesIn.length + a.rodsIn.length),
    )[0];
    if (rep) {
      for (const hIn of rep.shelvesIn) {
        const sy = yOf(hIn);
        if (sy < y0 + 2 || sy > floorY - 2) continue;
        svg.push(`<line x1="${f1(x0)}" y1="${f1(sy)}" x2="${f1(x0 + drawW)}" y2="${f1(sy)}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`);
        dimensions.push({ name: `Shelf height A.F.F.`, expectedIn: Math.round(hIn * 2) / 2, known: !model.assumed });
      }
      for (const hIn of rep.rodsIn) {
        const cy = yOf(hIn);
        const cx = x0 + drawW * 0.45;
        svg.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="4" fill="none" stroke="${MILL_EDGE}" stroke-width="2"/>`);
        dimensions.push({ name: `Rod height A.F.F.`, expectedIn: Math.round(hIn * 2) / 2, known: !model.assumed });
      }
      if (rep.drawers) {
        const stackTop = yOf(rep.drawers.count * rep.drawers.eachIn + (model.shoeBand?.heightIn ?? 0));
        svg.push(`<line x1="${f1(x0)}" y1="${f1(stackTop)}" x2="${f1(x0 + drawW)}" y2="${f1(stackTop)}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
        svg.push(`<text x="${f1(x0 + drawW + 10)}" y="${f1(stackTop + 4)}" font-family="sans-serif" font-size="10" fill="${DIM}">DRAWERS ×${rep.drawers.count}</text>`);
      }
    }

    // Floor
    svg.push(`<line x1="${f1(wallX - 20)}" y1="${f1(floorY)}" x2="${f1(x0 + drawW + 80)}" y2="${f1(floorY)}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
    svg.push(`<text x="${f1(wallX - 28)}" y="${f1(floorY + 18)}" font-family="sans-serif" font-size="10" fill="${DIM}">F.F.</text>`);

    // Depth + height dims
    const dimY = y0 - 25;
    svg.push(`<line x1="${f1(x0)}" y1="${f1(dimY)}" x2="${f1(x0 + drawW)}" y2="${f1(dimY)}" stroke="${DIM}" stroke-width="1"/>`);
    svg.push(`<text x="${f1(x0 + drawW / 2)}" y="${f1(dimY - 8)}" font-family="sans-serif" font-size="12" text-anchor="middle">${depthIn}"</text>`);
    dimensions.push({ name: "Case depth", expectedIn: depthIn, known: true });
    const hDimX = x0 + drawW + 40;
    svg.push(`<line x1="${f1(hDimX)}" y1="${f1(y0)}" x2="${f1(hDimX)}" y2="${f1(floorY)}" stroke="${DIM}" stroke-width="1"/>`);
    svg.push(`<text x="${f1(hDimX + 10)}" y="${f1(y0 + drawH / 2)}" font-family="sans-serif" font-size="12" transform="rotate(-90 ${f1(hDimX + 10)} ${f1(y0 + drawH / 2)})" text-anchor="middle">${Math.round(heightIn * 2) / 2}"</text>`);
    dimensions.push({ name: "Overall height", expectedIn: Math.round(heightIn * 2) / 2, known: !model.assumed });

    titleBlock(svg, W, margin, "SIDE ELEVATION", label, "N.T.S. — DO NOT SCALE");
    svg.push(`</svg>`);
    return { view: "side", mimeType: "image/png", dataBase64: await renderPng(svg), dimensions };
  }

  // ---- Legacy generic profile (no model) ----
  const depthIn = spec.depth ?? 16;
  const heightIn = spec.height ?? 84;
  const shelfCount = spec.shelfCount ?? 4;
  const availW = W - margin * 2 - 200;
  const availH = H - margin * 2 - 100;
  const pxPerIn = Math.min(availW / (depthIn + 12), availH / (heightIn + 12));
  const drawW = depthIn * pxPerIn;
  const drawH = heightIn * pxPerIn;
  const x0 = margin + 60;
  const y0 = margin + 40;
  const wallX = x0 - 30;
  svg.push(`<rect x="${f1(wallX)}" y="${f1(y0)}" width="24" height="${f1(drawH)}" fill="${WALL_FILL}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${f1(wallX - 8)}" y="${f1(y0 + drawH / 2)}" font-family="sans-serif" font-size="10" fill="${DIM}" transform="rotate(-90 ${f1(wallX - 8)} ${f1(y0 + drawH / 2)})" text-anchor="middle">WALL</text>`);
  const caseX = x0;
  svg.push(`<rect x="${f1(caseX)}" y="${f1(y0)}" width="${f1(drawW)}" height="${f1(drawH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
  const gableWPx = Math.max(4, 0.75 * pxPerIn);
  svg.push(`<rect x="${f1(caseX + drawW - gableWPx)}" y="${f1(y0)}" width="${f1(gableWPx)}" height="${f1(drawH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`);
  svg.push(`<text x="${f1(caseX + drawW + 10)}" y="${f1(y0 + drawH - 8)}" font-family="sans-serif" font-size="10" fill="${DIM}">GABLE</text>`);
  const shelfGap = drawH / (shelfCount + 1);
  for (let i = 1; i <= shelfCount; i++) {
    const sy = y0 + shelfGap * i;
    svg.push(`<line x1="${f1(caseX)}" y1="${f1(sy)}" x2="${f1(caseX + drawW)}" y2="${f1(sy)}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`);
    dimensions.push({ name: `Shelf ${i} height A.F.F.`, expectedIn: Math.round((heightIn - (heightIn / (shelfCount + 1)) * i) * 2) / 2, known: false });
  }
  const floorY = y0 + drawH;
  svg.push(`<line x1="${f1(wallX - 20)}" y1="${f1(floorY)}" x2="${f1(caseX + drawW + 80)}" y2="${f1(floorY)}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
  svg.push(`<text x="${f1(wallX - 28)}" y="${f1(floorY + 18)}" font-family="sans-serif" font-size="10" fill="${DIM}">F.F.</text>`);
  const dimY = y0 - 25;
  svg.push(`<line x1="${f1(caseX)}" y1="${f1(dimY)}" x2="${f1(caseX + drawW)}" y2="${f1(dimY)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(caseX + drawW / 2)}" y="${f1(dimY - 8)}" font-family="sans-serif" font-size="12" text-anchor="middle">${depthIn}"</text>`);
  dimensions.push({ name: "Case depth", expectedIn: depthIn, known: spec.depth !== null });
  const hDimX = caseX + drawW + 40;
  svg.push(`<line x1="${f1(hDimX)}" y1="${f1(y0)}" x2="${f1(hDimX)}" y2="${f1(floorY)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(hDimX + 10)}" y="${f1(y0 + drawH / 2)}" font-family="sans-serif" font-size="12" transform="rotate(-90 ${f1(hDimX + 10)} ${f1(y0 + drawH / 2)})" text-anchor="middle">${heightIn}"</text>`);
  dimensions.push({ name: "Overall height", expectedIn: heightIn, known: spec.height !== null });
  titleBlock(svg, W, margin, "SIDE ELEVATION", label, "N.T.S. — DO NOT SCALE");
  svg.push(`</svg>`);
  return { view: "side", mimeType: "image/png", dataBase64: await renderPng(svg), dimensions };
}

/**
 * Plan view: top-down footprint.
 * Model path: the unit's real extent on the wall, gable strips crossing
 * the depth at each section boundary, base footprint.
 */
export async function buildPlanView(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  model?: MillworkModel | null;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<MultiViewResult | null> {
  const { spec, model } = params;
  const label = (params.wallLabel || "wall").trim();

  const W = 1200;
  const H = 800;
  const margin = 80;
  const svg: string[] = [];
  const dimensions: MultiViewResult["dimensions"] = [];

  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<rect width="${W}" height="${H}" fill="white"/>`);
  svg.push(`<text x="${margin}" y="40" font-family="sans-serif" font-size="22" font-weight="bold">PLAN VIEW — ${label.toUpperCase()}</text>`);
  svg.push(`<text x="${margin}" y="62" font-family="sans-serif" font-size="11" fill="${DIM}">TOP DOWN · SHOP DRAWING — PRELIMINARY · VERIFY ON SITE</text>`);

  if (model) {
    const wallWIn = model.wallWIn;
    const depthIn = model.depthIn;
    const availW = W - margin * 2 - 200;
    const availH = H - margin * 2 - 100;
    const pxPerIn = Math.min(availW / (wallWIn + 12), availH / (depthIn + 30));
    const wallPxW = wallWIn * pxPerIn;
    const drawD = depthIn * pxPerIn;
    const x0 = margin + 60 + (availW - wallPxW) / 2;
    const y0 = margin + 110;
    const xOf = (inX: number) => x0 + inX * pxPerIn;

    // Wall (top, thick) spanning the full wall width
    svg.push(`<rect x="${f1(x0 - 20)}" y="${f1(y0 - 24)}" width="${f1(wallPxW + 40)}" height="20" fill="${WALL_FILL}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
    svg.push(`<text x="${f1(x0 + wallPxW / 2)}" y="${f1(y0 - 32)}" font-family="sans-serif" font-size="10" fill="${DIM}" text-anchor="middle">WALL — ${wallWIn}"</text>`);

    // Unit footprint
    const ux0 = xOf(model.unitX0In);
    const ux1 = xOf(model.unitX1In);
    svg.push(`<rect x="${f1(ux0)}" y="${f1(y0)}" width="${f1(ux1 - ux0)}" height="${f1(drawD)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);

    // Gable strips across the depth at each gable position
    const gableWPx = Math.max(3, 0.75 * pxPerIn);
    for (const g of model.gables) {
      const gx = xOf(g.xIn);
      svg.push(`<rect x="${f1(gx - gableWPx / 2)}" y="${f1(y0)}" width="${f1(gableWPx)}" height="${f1(drawD)}" fill="${MILL_EDGE}" opacity="0.55"/>`);
    }
    // Section labels along the front edge
    model.sections.forEach((s, i) => {
      const cx = xOf((s.x0In + s.x1In) / 2);
      svg.push(`<text x="${f1(cx)}" y="${f1(y0 + drawD + 18)}" font-family="sans-serif" font-size="10" fill="${DIM}" text-anchor="middle">S${i + 1}</text>`);
    });

    // Unit width dimension
    const wDimY = y0 + drawD + 38;
    svg.push(`<line x1="${f1(ux0)}" y1="${f1(wDimY)}" x2="${f1(ux1)}" y2="${f1(wDimY)}" stroke="${DIM}" stroke-width="1"/>`);
    svg.push(`<text x="${f1((ux0 + ux1) / 2)}" y="${f1(wDimY + 18)}" font-family="sans-serif" font-size="12" text-anchor="middle">UNIT ${Math.round((model.unitX1In - model.unitX0In) * 2) / 2}"</text>`);
    dimensions.push({ name: "Overall width", expectedIn: Math.round((model.unitX1In - model.unitX0In) * 2) / 2, known: !model.assumed });

    // Depth dimension (right)
    const dDimX = ux1 + 30;
    svg.push(`<line x1="${f1(dDimX)}" y1="${f1(y0)}" x2="${f1(dDimX)}" y2="${f1(y0 + drawD)}" stroke="${DIM}" stroke-width="1"/>`);
    svg.push(`<text x="${f1(dDimX + 12)}" y="${f1(y0 + drawD / 2)}" font-family="sans-serif" font-size="12" transform="rotate(-90 ${f1(dDimX + 12)} ${f1(y0 + drawD / 2)})" text-anchor="middle">${depthIn}"</text>`);
    dimensions.push({ name: "Case depth", expectedIn: depthIn, known: true });

    svg.push(`<text x="${f1(x0)}" y="${f1(wDimY + 48)}" font-family="sans-serif" font-size="10" fill="${DIM}">Note: scribe to wall — never model zero-gap fit. Dark strips = gable panels.</text>`);
    titleBlock(svg, W, margin, "PLAN VIEW", label, "N.T.S. — DO NOT SCALE");
    svg.push(`</svg>`);
    return { view: "plan", mimeType: "image/png", dataBase64: await renderPng(svg), dimensions };
  }

  // ---- Legacy generic footprint ----
  const widthIn = spec.width ?? 96;
  const depthIn = spec.depth ?? 16;
  const availW = W - margin * 2 - 200;
  const availH = H - margin * 2 - 100;
  const pxPerIn = Math.min(availW / (widthIn + 12), availH / (depthIn + 24));
  const drawW = widthIn * pxPerIn;
  const drawD = depthIn * pxPerIn;
  const x0 = margin + 60;
  const y0 = margin + 80;
  svg.push(`<rect x="${f1(x0 - 20)}" y="${f1(y0 - 24)}" width="${f1(drawW + 40)}" height="20" fill="${WALL_FILL}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${f1(x0 + drawW / 2)}" y="${f1(y0 - 30)}" font-family="sans-serif" font-size="10" fill="${DIM}" text-anchor="middle">WALL</text>`);
  svg.push(`<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(drawW)}" height="${f1(drawD)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
  svg.push(`<line x1="${f1(x0 + drawW / 2)}" y1="${f1(y0 - 10)}" x2="${f1(x0 + drawW / 2)}" y2="${f1(y0 + drawD + 10)}" stroke="${DIM}" stroke-width="1" stroke-dasharray="8,4"/>`);
  const wDimY = y0 + drawD + 30;
  svg.push(`<line x1="${f1(x0)}" y1="${f1(wDimY)}" x2="${f1(x0 + drawW)}" y2="${f1(wDimY)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(x0 + drawW / 2)}" y="${f1(wDimY + 18)}" font-family="sans-serif" font-size="12" text-anchor="middle">${widthIn}"</text>`);
  dimensions.push({ name: "Overall width", expectedIn: widthIn, known: spec.width !== null });
  const dDimX = x0 + drawW + 30;
  svg.push(`<line x1="${f1(dDimX)}" y1="${f1(y0)}" x2="${f1(dDimX)}" y2="${f1(y0 + drawD)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(dDimX + 12)}" y="${f1(y0 + drawD / 2)}" font-family="sans-serif" font-size="12" transform="rotate(-90 ${f1(dDimX + 12)} ${f1(y0 + drawD / 2)})" text-anchor="middle">${depthIn}"</text>`);
  dimensions.push({ name: "Case depth", expectedIn: depthIn, known: spec.depth !== null });
  svg.push(`<text x="${f1(x0)}" y="${f1(wDimY + 45)}" font-family="sans-serif" font-size="10" fill="${DIM}">Note: scribe to wall — never model zero-gap fit.</text>`);
  titleBlock(svg, W, margin, "PLAN VIEW", label, "N.T.S. — DO NOT SCALE");
  svg.push(`</svg>`);
  return { view: "plan", mimeType: "image/png", dataBase64: await renderPng(svg), dimensions };
}

/**
 * Isometric view: 30-degree projection.
 * Model path: the actual unit — case box with its sections, gables,
 * shelves at real heights, base cabinet with fronts, in projection.
 * Floating-shelf models render as iso shelf slabs (no case).
 */
export async function buildIsometricView(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  model?: MillworkModel | null;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<MultiViewResult | null> {
  const { spec, model } = params;
  const label = (params.wallLabel || "wall").trim();

  const W = 1200;
  const H = 900;
  const margin = 80;
  const svg: string[] = [];
  const dimensions: MultiViewResult["dimensions"] = [];

  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<rect width="${W}" height="${H}" fill="white"/>`);
  svg.push(`<text x="${margin}" y="40" font-family="sans-serif" font-size="22" font-weight="bold">ISOMETRIC — ${label.toUpperCase()}</text>`);
  svg.push(`<text x="${margin}" y="62" font-family="sans-serif" font-size="11" fill="${DIM}">3D VISUALIZATION · NOT FOR FABRICATION · VERIFY ON SITE</text>`);

  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);

  if (model) {
    const unitW = Math.max(6, model.unitX1In - model.unitX0In);
    const unitH = model.unitTopIn;
    const d = model.depthIn;
    const isoW = unitW + d * cos30;
    const isoH = unitH + d * sin30;
    const s = Math.min((W - margin * 2 - 200) / isoW, (H - margin * 2 - 100) / isoH);
    const ox = margin + 60 + d * cos30 * s + (W - margin * 2 - 200 - isoW * s) / 2;
    const oy = margin + 80 + unitH * s;
    // Local coords: u = inches right of unit left, v = inches A.F.F., w = inches of depth (0=front)
    const P = (u: number, v: number, w: number): [number, number] => [
      ox + (u - w * cos30) * s,
      oy - v * s - w * sin30 * s,
    ];
    const poly = (pts: [number, number][], fill: string, wdt = 2) =>
      svg.push(
        `<polygon points="${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ")}" fill="${fill}" stroke="${MILL_EDGE}" stroke-width="${wdt}"/>`,
      );
    const line = (a: [number, number], b: [number, number], wdt = 2) =>
      svg.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${MILL_EDGE}" stroke-width="${wdt}"/>`);

    const hasCase = model.sections.some((sec) => sec.cased) || model.baseRuns.length > 0;
    if (hasCase) {
      // Depth recedes up-left in this projection, so the visible side is
      // the LEFT end face (u = 0), then top, then front.
      poly([P(0, 0, 0), P(0, 0, d), P(0, unitH, d), P(0, unitH, 0)], "#E8E8E8");
      poly([P(0, unitH, 0), P(unitW, unitH, 0), P(unitW, unitH, d), P(0, unitH, d)], "#FAFAFA");
      poly([P(0, 0, 0), P(unitW, 0, 0), P(unitW, unitH, 0), P(0, unitH, 0)], MILL_FILL, 3);

      // Base runs + fronts on the front face
      for (const run of model.baseRuns) {
        const ru0 = run.x0In - model.unitX0In;
        const ru1 = run.x1In - model.unitX0In;
        poly([P(ru0, 0, 0), P(ru1, 0, 0), P(ru1, run.heightIn, 0), P(ru0, run.heightIn, 0)], "#EFEFEF", 2);
        for (const fr of run.fronts) {
          const fu0 = fr.x0In - model.unitX0In;
          const fu1 = fr.x1In - model.unitX0In;
          line(P(fu0, fr.y0In, 0), P(fu0, fr.y1In, 0), 1);
          line(P(fu1, fr.y0In, 0), P(fu1, fr.y1In, 0), 1);
          line(P(fu0, fr.y1In, 0), P(fu1, fr.y1In, 0), 1);
        }
      }
      // Gables (verticals on the front face) + side-face base line
      for (const g of model.gables) {
        const gu = g.xIn - model.unitX0In;
        line(P(gu, g.bottomIn, 0), P(gu, g.topIn, 0), 2.5);
      }
      // Sections: shelves (front-face segments), rods, drawer stacks
      for (const sec of model.sections) {
        const su0 = sec.x0In - model.unitX0In;
        const su1 = sec.x1In - model.unitX0In;
        for (const hIn of sec.shelvesIn) line(P(su0, hIn, 0), P(su1, hIn, 0), 2);
        for (const hIn of sec.rodsIn) line(P(su0, hIn, 0), P(su1, hIn, 0), 1.5);
        if (sec.drawers) {
          const base = model.shoeBand?.heightIn ?? 0;
          for (let i = 1; i <= sec.drawers.count; i++) {
            const y = base + i * sec.drawers.eachIn;
            line(P(su0, y, 0), P(su1, y, 0), 1.5);
          }
        }
      }
      // Side face: shelf lines of the first section, in depth
      const first = model.sections[0];
      if (first) {
        for (const hIn of first.shelvesIn) line(P(0, hIn, 0), P(0, hIn, d), 1.5);
      }
    } else {
      // Floating shelves: iso slabs at their real heights
      for (const sec of model.sections) {
        const su0 = sec.x0In - model.unitX0In;
        const su1 = sec.x1In - model.unitX0In;
        for (const hIn of sec.shelvesIn) {
          poly([P(su0, hIn, 0), P(su1, hIn, 0), P(su1, hIn, d), P(su0, hIn, d)], "#FAFAFA", 1.5);
          line(P(su0, hIn, 0), P(su1, hIn, 0), 2.5);
          line(P(su1, hIn, 0), P(su1, hIn - 1.5, 0), 2);
          line(P(su0, hIn, 0), P(su0, hIn - 1.5, 0), 2);
          line(P(su0, hIn - 1.5, 0), P(su1, hIn - 1.5, 0), 2);
        }
      }
    }

    dimensions.push({ name: "Width", expectedIn: Math.round(unitW * 2) / 2, known: !model.assumed });
    dimensions.push({ name: "Height", expectedIn: Math.round(unitH * 2) / 2, known: !model.assumed });
    dimensions.push({ name: "Depth", expectedIn: d, known: true });
    const [fx0, fy0] = P(0, 0, 0);
    const [fx1] = P(unitW, 0, 0);
    svg.push(`<text x="${f1((fx0 + fx1) / 2)}" y="${f1(fy0 + 25)}" font-family="sans-serif" font-size="12" text-anchor="middle">${Math.round(unitW)}"</text>`);
    titleBlock(svg, W, margin, "ISOMETRIC", label, "NOT FOR FABRICATION");
    svg.push(`</svg>`);
    return { view: "isometric", mimeType: "image/png", dataBase64: await renderPng(svg), dimensions };
  }

  // ---- Legacy generic iso box ----
  const widthIn = spec.width ?? 96;
  const heightIn = spec.height ?? 84;
  const depthIn = spec.depth ?? 16;
  const shelfCount = spec.shelfCount ?? 4;
  const isoW = widthIn + depthIn * cos30;
  const isoH = heightIn + depthIn * sin30;
  const pxPerIn = Math.min((W - margin * 2 - 200) / isoW, (H - margin * 2 - 100) / isoH);
  const ox = margin + 100 + depthIn * cos30 * pxPerIn;
  const oy = margin + 60 + heightIn * pxPerIn;
  const px = (x: number, y: number, z: number): [number, number] => [
    ox + (x - z * cos30) * pxPerIn,
    oy - y * pxPerIn - z * sin30 * pxPerIn,
  ];
  const w = widthIn;
  const h = heightIn;
  const d = depthIn;
  const [rx0, ry0] = px(w, 0, 0);
  const [rx1, ry1] = px(w, 0, d);
  const [rx2, ry2] = px(w, h, d);
  const [rx3, ry3] = px(w, h, 0);
  const [fx0, fy0] = px(0, 0, 0);
  const [fx1, fy1] = px(w, 0, 0);
  const [fx2, fy2] = px(w, h, 0);
  const [fx3, fy3] = px(0, h, 0);
  const [tx0, ty0] = px(0, h, 0);
  const [tx1, ty1] = px(w, h, 0);
  const [tx2, ty2] = px(w, h, d);
  const [tx3, ty3] = px(0, h, d);
  svg.push(`<polygon points="${f1(rx0)},${f1(ry0)} ${f1(rx1)},${f1(ry1)} ${f1(rx2)},${f1(ry2)} ${f1(rx3)},${f1(ry3)}" fill="#E8E8E8" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<polygon points="${f1(tx0)},${f1(ty0)} ${f1(tx1)},${f1(ty1)} ${f1(tx2)},${f1(ty2)} ${f1(tx3)},${f1(ty3)}" fill="#FAFAFA" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<polygon points="${f1(fx0)},${f1(fy0)} ${f1(fx1)},${f1(fy1)} ${f1(fx2)},${f1(fy2)} ${f1(fx3)},${f1(fy3)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
  for (let i = 1; i <= shelfCount; i++) {
    const sy = (h / (shelfCount + 1)) * i;
    const [sx0, syy0] = px(0, sy, 0);
    const [sx1, syy1] = px(w, sy, 0);
    svg.push(`<line x1="${f1(sx0)}" y1="${f1(syy0)}" x2="${f1(sx1)}" y2="${f1(syy1)}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  }
  dimensions.push({ name: "Width", expectedIn: w, known: spec.width !== null });
  dimensions.push({ name: "Height", expectedIn: h, known: spec.height !== null });
  dimensions.push({ name: "Depth", expectedIn: d, known: spec.depth !== null });
  svg.push(`<text x="${f1((fx0 + fx1) / 2)}" y="${f1(fy0 + 25)}" font-family="sans-serif" font-size="12" text-anchor="middle">${w}"</text>`);
  titleBlock(svg, W, margin, "ISOMETRIC", label, "NOT FOR FABRICATION");
  svg.push(`</svg>`);
  return { view: "isometric", mimeType: "image/png", dataBase64: await renderPng(svg), dimensions };
}
