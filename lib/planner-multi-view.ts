/**
 * Multi-view shop drawings: side elevation, plan view, and isometric.
 * Complements the front elevation from planner-shop-drawing.ts.
 *
 * These are simplified line drawings for installation planning:
 * - Side: depth profile showing wall, case, shelves, mounting
 * - Plan: top-down footprint showing width x depth on the wall
 * - Isometric: 3D projection for visualization
 */

import type { PlannerVisualSpec } from "./planner-visual-spec.js";

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

/**
 * Side elevation: looking at the unit from the side.
 * Shows: wall (left), case depth, shelf depths, mounting cleat, floor.
 */
export async function buildSideElevation(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<MultiViewResult | null> {
  const { spec } = params;
  const label = (params.wallLabel || "wall").trim();

  const depthIn = spec.depth ?? 16; // default 16" deep
  const heightIn = spec.height ?? 84;
  const shelfCount = spec.shelfCount ?? 4;

  const W = 1200;
  const H = 900;
  const margin = 80;

  // Scale to fit
  const availW = W - margin * 2 - 200; // room for title block
  const availH = H - margin * 2 - 100;
  const pxPerIn = Math.min(availW / (depthIn + 12), availH / (heightIn + 12));

  const drawW = depthIn * pxPerIn;
  const drawH = heightIn * pxPerIn;
  const x0 = margin + 60;
  const y0 = margin + 40; // top

  const svg: string[] = [];
  const dimensions: MultiViewResult["dimensions"] = [];

  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<rect width="${W}" height="${H}" fill="white"/>`);

  // Title
  svg.push(`<text x="${margin}" y="40" font-family="sans-serif" font-size="22" font-weight="bold">SIDE ELEVATION — ${label.toUpperCase()}</text>`);
  svg.push(`<text x="${margin}" y="62" font-family="sans-serif" font-size="11" fill="${DIM}">SHOP DRAWING — PRELIMINARY · VERIFY ALL DIMENSIONS ON SITE BEFORE FABRICATION</text>`);

  // Wall (left side, hatched)
  const wallX = x0 - 30;
  svg.push(`<rect x="${f1(wallX)}" y="${f1(y0)}" width="24" height="${f1(drawH)}" fill="${WALL_FILL}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${f1(wallX - 8)}" y="${f1(y0 + drawH / 2)}" font-family="sans-serif" font-size="10" fill="${DIM}" transform="rotate(-90 ${f1(wallX - 8)} ${f1(y0 + drawH / 2)})" text-anchor="middle">WALL</text>`);

  // Case body (side profile)
  const caseX = x0;
  svg.push(`<rect x="${f1(caseX)}" y="${f1(y0)}" width="${f1(drawW)}" height="${f1(drawH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);

  // Shelves (horizontal lines in side view)
  const shelfGap = drawH / (shelfCount + 1);
  for (let i = 1; i <= shelfCount; i++) {
    const sy = y0 + shelfGap * i;
    svg.push(`<line x1="${f1(caseX)}" y1="${f1(sy)}" x2="${f1(caseX + drawW)}" y2="${f1(sy)}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`);
    dimensions.push({ name: `Shelf ${i} height A.F.F.`, expectedIn: Math.round((heightIn - (heightIn / (shelfCount + 1)) * i) * 2) / 2, known: false });
  }

  // Mounting cleat (french cleat at top)
  const cleatY = y0 + 12;
  svg.push(`<rect x="${f1(caseX - 6)}" y="${f1(cleatY)}" width="${f1(drawW + 6)}" height="10" fill="${MILL_EDGE}" opacity="0.3"/>`);
  svg.push(`<text x="${f1(caseX + drawW + 10)}" y="${f1(cleatY + 8)}" font-family="sans-serif" font-size="10" fill="${DIM}">French cleat</text>`);

  // Floor line
  const floorY = y0 + drawH;
  svg.push(`<line x1="${f1(wallX - 20)}" y1="${f1(floorY)}" x2="${f1(caseX + drawW + 80)}" y2="${f1(floorY)}" stroke="${MILL_EDGE}" stroke-width="3"/>`);
  svg.push(`<text x="${f1(wallX - 28)}" y="${f1(floorY + 18)}" font-family="sans-serif" font-size="10" fill="${DIM}">F.F.</text>`);

  // Depth dimension (top)
  const dimY = y0 - 25;
  svg.push(`<line x1="${f1(caseX)}" y1="${f1(dimY)}" x2="${f1(caseX + drawW)}" y2="${f1(dimY)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<line x1="${f1(caseX)}" y1="${f1(dimY - 5)}" x2="${f1(caseX)}" y2="${f1(dimY + 5)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<line x1="${f1(caseX + drawW)}" y1="${f1(dimY - 5)}" x2="${f1(caseX + drawW)}" y2="${f1(dimY + 5)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(caseX + drawW / 2)}" y="${f1(dimY - 8)}" font-family="sans-serif" font-size="12" text-anchor="middle">${depthIn}"</text>`);
  dimensions.push({ name: "Case depth", expectedIn: depthIn, known: spec.depth !== null });

  // Height dimension (right side)
  const hDimX = caseX + drawW + 40;
  svg.push(`<line x1="${f1(hDimX)}" y1="${f1(y0)}" x2="${f1(hDimX)}" y2="${f1(floorY)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(hDimX + 10)}" y="${f1(y0 + drawH / 2)}" font-family="sans-serif" font-size="12" transform="rotate(-90 ${f1(hDimX + 10)} ${f1(y0 + drawH / 2)})" text-anchor="middle">${heightIn}"</text>`);
  dimensions.push({ name: "Overall height", expectedIn: heightIn, known: spec.height !== null });

  // Title block (simplified)
  const tbX = W - 180;
  svg.push(`<rect x="${tbX}" y="${margin}" width="160" height="120" fill="none" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 20}" font-family="sans-serif" font-size="11" font-weight="bold">LEVEL UP INSTALL</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 40}" font-family="sans-serif" font-size="9">SIDE ELEVATION</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 60}" font-family="sans-serif" font-size="9">${label}</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 100}" font-family="sans-serif" font-size="9" fill="${DIM}">N.T.S. — DO NOT SCALE</text>`);

  svg.push(`</svg>`);

  // Render to PNG via sharp
  const { default: sharp } = await import("sharp");
  const { ensurePlannerFonts } = await import("./planner-svg-font");
  await ensurePlannerFonts();
  const png = await sharp(Buffer.from(svg.join("\n"))).png().toBuffer();

  return {
    view: "side",
    mimeType: "image/png",
    dataBase64: png.toString("base64"),
    dimensions,
  };
}

/**
 * Plan view: top-down footprint.
 * Shows: wall (top), case width x depth, position.
 */
export async function buildPlanView(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<MultiViewResult | null> {
  const { spec } = params;
  const label = (params.wallLabel || "wall").trim();

  const widthIn = spec.width ?? 96;
  const depthIn = spec.depth ?? 16;

  const W = 1200;
  const H = 800;
  const margin = 80;

  const availW = W - margin * 2 - 200;
  const availH = H - margin * 2 - 100;
  const pxPerIn = Math.min(availW / (widthIn + 12), availH / (depthIn + 24));

  const drawW = widthIn * pxPerIn;
  const drawD = depthIn * pxPerIn;
  const x0 = margin + 60;
  const y0 = margin + 80;

  const svg: string[] = [];
  const dimensions: MultiViewResult["dimensions"] = [];

  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<rect width="${W}" height="${H}" fill="white"/>`);

  svg.push(`<text x="${margin}" y="40" font-family="sans-serif" font-size="22" font-weight="bold">PLAN VIEW — ${label.toUpperCase()}</text>`);
  svg.push(`<text x="${margin}" y="62" font-family="sans-serif" font-size="11" fill="${DIM}">TOP DOWN · SHOP DRAWING — PRELIMINARY · VERIFY ON SITE</text>`);

  // Wall (top, thick)
  svg.push(`<rect x="${f1(x0 - 20)}" y="${f1(y0 - 24)}" width="${f1(drawW + 40)}" height="20" fill="${WALL_FILL}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${f1(x0 + drawW / 2)}" y="${f1(y0 - 30)}" font-family="sans-serif" font-size="10" fill="${DIM}" text-anchor="middle">WALL</text>`);

  // Case footprint
  svg.push(`<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(drawW)}" height="${f1(drawD)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);

  // Centerline
  svg.push(`<line x1="${f1(x0 + drawW / 2)}" y1="${f1(y0 - 10)}" x2="${f1(x0 + drawW / 2)}" y2="${f1(y0 + drawD + 10)}" stroke="${DIM}" stroke-width="1" stroke-dasharray="8,4"/>`);

  // Width dimension (bottom)
  const wDimY = y0 + drawD + 30;
  svg.push(`<line x1="${f1(x0)}" y1="${f1(wDimY)}" x2="${f1(x0 + drawW)}" y2="${f1(wDimY)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(x0 + drawW / 2)}" y="${f1(wDimY + 18)}" font-family="sans-serif" font-size="12" text-anchor="middle">${widthIn}"</text>`);
  dimensions.push({ name: "Overall width", expectedIn: widthIn, known: spec.width !== null });

  // Depth dimension (right)
  const dDimX = x0 + drawW + 30;
  svg.push(`<line x1="${f1(dDimX)}" y1="${f1(y0)}" x2="${f1(dDimX)}" y2="${f1(y0 + drawD)}" stroke="${DIM}" stroke-width="1"/>`);
  svg.push(`<text x="${f1(dDimX + 12)}" y="${f1(y0 + drawD / 2)}" font-family="sans-serif" font-size="12" transform="rotate(-90 ${f1(dDimX + 12)} ${f1(y0 + drawD / 2)})" text-anchor="middle">${depthIn}"</text>`);
  dimensions.push({ name: "Case depth", expectedIn: depthIn, known: spec.depth !== null });

  // Scribe note
  svg.push(`<text x="${f1(x0)}" y="${f1(wDimY + 45)}" font-family="sans-serif" font-size="10" fill="${DIM}">Note: scribe to wall — never model zero-gap fit.</text>`);

  // Title block
  const tbX = W - 180;
  svg.push(`<rect x="${tbX}" y="${margin}" width="160" height="120" fill="none" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 20}" font-family="sans-serif" font-size="11" font-weight="bold">LEVEL UP INSTALL</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 40}" font-family="sans-serif" font-size="9">PLAN VIEW</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 100}" font-family="sans-serif" font-size="9" fill="${DIM}">N.T.S. — DO NOT SCALE</text>`);

  svg.push(`</svg>`);

  const { default: sharp } = await import("sharp");
  const { ensurePlannerFonts } = await import("./planner-svg-font");
  await ensurePlannerFonts();
  const png = await sharp(Buffer.from(svg.join("\n"))).png().toBuffer();

  return {
    view: "plan",
    mimeType: "image/png",
    dataBase64: png.toString("base64"),
    dimensions,
  };
}

/**
 * Isometric view: simple 30-degree projection for 3D visualization.
 * Shows the case as a 3D box with visible shelves.
 */
export async function buildIsometricView(params: {
  wallLabel: string;
  spec: PlannerVisualSpec;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<MultiViewResult | null> {
  const { spec } = params;
  const label = (params.wallLabel || "wall").trim();

  const widthIn = spec.width ?? 96;
  const heightIn = spec.height ?? 84;
  const depthIn = spec.depth ?? 16;
  const shelfCount = spec.shelfCount ?? 4;

  const W = 1200;
  const H = 900;
  const margin = 80;

  // Isometric projection: 30 degrees
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);

  // Scale to fit
  const isoW = (widthIn + depthIn * cos30);
  const isoH = (heightIn + depthIn * sin30);
  const pxPerIn = Math.min((W - margin * 2 - 200) / isoW, (H - margin * 2 - 100) / isoH);

  // Origin (front-bottom-left)
  const ox = margin + 100 + depthIn * cos30 * pxPerIn;
  const oy = margin + 60 + heightIn * pxPerIn;

  // Project 3D (x=width, y=height up, z=depth) to 2D
  const px = (x: number, y: number, z: number): [number, number] => {
    const sx = ox + (x - z * cos30) * pxPerIn;
    const sy = oy - y * pxPerIn - z * sin30 * pxPerIn;
    return [sx, sy];
  };

  const svg: string[] = [];
  const dimensions: MultiViewResult["dimensions"] = [];

  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<rect width="${W}" height="${H}" fill="white"/>`);

  svg.push(`<text x="${margin}" y="40" font-family="sans-serif" font-size="22" font-weight="bold">ISOMETRIC — ${label.toUpperCase()}</text>`);
  svg.push(`<text x="${margin}" y="62" font-family="sans-serif" font-size="11" fill="${DIM}">3D VISUALIZATION · NOT FOR FABRICATION · VERIFY ON SITE</text>`);

  const w = widthIn;
  const h = heightIn;
  const d = depthIn;

  // Draw order: back faces first, then front
  // Back face (z=d)
  const [bx0, by0] = px(0, 0, d);
  const [bx1, by1] = px(w, 0, d);
  const [bx2, by2] = px(w, h, d);
  const [bx3, by3] = px(0, h, d);

  // Right face (x=w)
  const [rx0, ry0] = px(w, 0, 0);
  const [rx1, ry1] = px(w, 0, d);
  const [rx2, ry2] = px(w, h, d);
  const [rx3, ry3] = px(w, h, 0);

  // Front face (z=0)
  const [fx0, fy0] = px(0, 0, 0);
  const [fx1, fy1] = px(w, 0, 0);
  const [fx2, fy2] = px(w, h, 0);
  const [fx3, fy3] = px(0, h, 0);

  // Top face (y=h)
  const [tx0, ty0] = px(0, h, 0);
  const [tx1, ty1] = px(w, h, 0);
  const [tx2, ty2] = px(w, h, d);
  const [tx3, ty3] = px(0, h, d);

  // Right face (darker)
  svg.push(`<polygon points="${f1(rx0)},${f1(ry0)} ${f1(rx1)},${f1(ry1)} ${f1(rx2)},${f1(ry2)} ${f1(rx3)},${f1(ry3)}" fill="#E8E8E8" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  // Top face (lightest)
  svg.push(`<polygon points="${f1(tx0)},${f1(ty0)} ${f1(tx1)},${f1(ty1)} ${f1(tx2)},${f1(ty2)} ${f1(tx3)},${f1(ty3)}" fill="#FAFAFA" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  // Front face (main)
  svg.push(`<polygon points="${f1(fx0)},${f1(fy0)} ${f1(fx1)},${f1(fy1)} ${f1(fx2)},${f1(fy2)} ${f1(fx3)},${f1(fy3)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="3"/>`);

  // Shelves on front face (horizontal lines)
  for (let i = 1; i <= shelfCount; i++) {
    const sy = (h / (shelfCount + 1)) * i;
    const [sx0, syy0] = px(0, sy, 0);
    const [sx1, syy1] = px(w, sy, 0);
    svg.push(`<line x1="${f1(sx0)}" y1="${f1(syy0)}" x2="${f1(sx1)}" y2="${f1(syy1)}" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  }

  // Dimension labels
  dimensions.push({ name: "Width", expectedIn: w, known: spec.width !== null });
  dimensions.push({ name: "Height", expectedIn: h, known: spec.height !== null });
  dimensions.push({ name: "Depth", expectedIn: d, known: spec.depth !== null });

  svg.push(`<text x="${f1((fx0 + fx1) / 2)}" y="${f1(fy0 + 25)}" font-family="sans-serif" font-size="12" text-anchor="middle">${w}"</text>`);

  // Title block
  const tbX = W - 180;
  svg.push(`<rect x="${tbX}" y="${margin}" width="160" height="120" fill="none" stroke="${MILL_EDGE}" stroke-width="2"/>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 20}" font-family="sans-serif" font-size="11" font-weight="bold">LEVEL UP INSTALL</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 40}" font-family="sans-serif" font-size="9">ISOMETRIC</text>`);
  svg.push(`<text x="${tbX + 8}" y="${margin + 100}" font-family="sans-serif" font-size="9" fill="${DIM}">NOT FOR FABRICATION</text>`);

  svg.push(`</svg>`);

  const { default: sharp } = await import("sharp");
  const { ensurePlannerFonts } = await import("./planner-svg-font");
  await ensurePlannerFonts();
  const png = await sharp(Buffer.from(svg.join("\n"))).png().toBuffer();

  return {
    view: "isometric",
    mimeType: "image/png",
    dataBase64: png.toString("base64"),
    dimensions,
  };
}
