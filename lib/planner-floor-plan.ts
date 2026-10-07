/**
 * Deterministic top-down floor plan for multi-wall planner sessions.
 *
 * When the homeowner uploads photos of several walls (L-shaped kitchen,
 * U-shaped walk-in closet), the per-wall concept renders show elevations but
 * nothing shows how the walls connect. This draws a code-generated plan view:
 * walls as labeled runs, millwork bands along each wall, and the assumed
 * room geometry — the view that makes a wraparound design quotable.
 *
 * This image is for the HOMEOWNER (shown in chat), not a binding reference
 * for the image model. Dimensions are proportional placeholders unless the
 * spec provides them — the plan is marked "verify on site".
 *
 * SVG -> PNG via sharp, same pattern as lib/planner-schematic-guide.ts.
 */

import type { PlannerVisualSpec } from "@/lib/planner-visual-spec";

export type FloorPlanResult = {
  mimeType: "image/png";
  dataBase64: string;
};

const W = 1024;
const H = 768;
const MARGIN = 90;

type WallPos = "top" | "left" | "right" | "bottom";

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

/**
 * Map wall labels to plan positions. Keyword match first ("back wall" → top);
 * unmatched walls fill a sensible default per count (2 → L, 3 → U, 4 → full).
 */
function assignPositions(labels: string[]): WallPos[] {
  const n = labels.length;
  const out: (WallPos | null)[] = labels.map(() => null);
  const used = new Set<WallPos>();
  labels.forEach((label, i) => {
    const l = label.toLowerCase();
    if (!out[i] && /\b(back|rear)\b/.test(l) && !used.has("top")) {
      out[i] = "top";
      used.add("top");
    } else if (!out[i] && /\bleft\b/.test(l) && !used.has("left")) {
      out[i] = "left";
      used.add("left");
    } else if (!out[i] && /\bright\b/.test(l) && !used.has("right")) {
      out[i] = "right";
      used.add("right");
    } else if (!out[i] && /\bfront\b/.test(l) && !used.has("bottom")) {
      out[i] = "bottom";
      used.add("bottom");
    }
  });
  const fallback: WallPos[] =
    n === 2
      ? ["top", "left"]
      : n === 3
        ? ["top", "left", "right"]
        : n >= 4
          ? ["top", "left", "right", "bottom"]
          : ["top"];
  let fi = 0;
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) {
      while (fi < fallback.length && used.has(fallback[fi])) fi++;
      const pos = fallback[fi] ?? "top";
      out[i] = pos;
      used.add(pos);
      fi++;
    }
  }
  return out as WallPos[];
}

function shapeName(positions: WallPos[]): string {
  const set = new Set(positions);
  if (set.has("top") && set.has("left") && set.has("right") && set.has("bottom"))
    return "full room";
  if (set.has("top") && set.has("left") && set.has("right")) return "U-layout";
  if (set.size === 2) return "L-layout";
  return "wall run";
}

/** Millwork depth in inches: spec depth, else a category sensible default. */
function millworkDepthIn(spec: PlannerVisualSpec): number {
  if (spec.depth !== null && spec.depth > 0) return spec.depth;
  const cat = (spec.designCategory ?? "").toLowerCase();
  if (cat.includes("closet")) return 24;
  if (cat.includes("cabinet") || cat.includes("kitchen")) return 24;
  if (cat.includes("shelv")) return 12;
  return 16;
}

function millworkLabel(spec: PlannerVisualSpec): string {
  const bits: string[] = [];
  if (spec.shelfCount !== null && spec.shelfCount > 0)
    bits.push(`${spec.shelfCount} shel${spec.shelfCount === 1 ? "f" : "ves"}`);
  const cat = (spec.designCategory ?? "").toLowerCase();
  if (cat.includes("closet")) bits.push("closet system");
  else if (cat.includes("cabinet") || cat.includes("kitchen")) bits.push("cabinets");
  else if (bits.length === 0) bits.push("millwork");
  return bits.join(" + ");
}

export async function buildPlannerFloorPlan(params: {
  wallLabels: string[];
  spec: PlannerVisualSpec;
  roomType?: string | null;
}): Promise<FloorPlanResult | null> {
  const labels = params.wallLabels.filter((l) => l.trim().length > 0).slice(0, 6);
  if (labels.length < 2) return null;

  const positions = assignPositions(labels);
  const shape = shapeName(positions);
  const depthIn = millworkDepthIn(params.spec);
  const mwLabel = millworkLabel(params.spec);

  // Room rectangle (interior).
  const x0 = MARGIN;
  const y0 = MARGIN + 40;
  const x1 = W - MARGIN;
  const y1 = H - MARGIN - 30;
  const roomW = x1 - x0;
  const roomH = y1 - y0;

  // Assume ~10 ft of primary wall for px scaling of the millwork band.
  const pxPerIn = roomW / 120;
  const bandPx = Math.max(36, Math.min(130, depthIn * pxPerIn));
  const wallThick = 14;

  const posSet = new Set(positions);
  const svg: string[] = [];
  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#faf8ff"/>`,
  );

  // Title.
  const roomTitle = params.roomType ? ` — ${params.roomType}` : "";
  svg.push(
    `<text x="${W / 2}" y="38" font-family="sans-serif" font-size="26" font-weight="bold" fill="#31184a" text-anchor="middle">FLOOR PLAN${esc(roomTitle).toUpperCase()}</text>`,
  );

  // Interior fill.
  svg.push(
    `<rect x="${x0}" y="${y0}" width="${roomW}" height="${roomH}" fill="#ffffff" stroke="#d9c2ff" stroke-width="2"/>`,
  );

  // Walls (thick) + millwork bands + labels per position.
  const wallColor = "#31184a";
  const bandFill = "#b794e6";
  const bandStroke = "#6e3eb2";

  const drawWall = (
    pos: WallPos,
    label: string,
  ) => {
    const safe = esc(label);
    if (pos === "top") {
      svg.push(
        `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${wallColor}" stroke-width="${wallThick}" stroke-linecap="square"/>`,
        `<rect x="${x0 + wallThick}" y="${y0 + wallThick}" width="${roomW - wallThick * 2}" height="${bandPx}" fill="${bandFill}" fill-opacity="0.55" stroke="${bandStroke}" stroke-width="2"/>`,
        `<text x="${(x0 + x1) / 2}" y="${y0 - 14}" font-family="sans-serif" font-size="19" font-weight="bold" fill="${wallColor}" text-anchor="middle" style="text-transform:capitalize">${safe}</text>`,
      );
    } else if (pos === "bottom") {
      svg.push(
        `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${wallColor}" stroke-width="${wallThick}" stroke-linecap="square"/>`,
        `<rect x="${x0 + wallThick}" y="${y1 - wallThick - bandPx}" width="${roomW - wallThick * 2}" height="${bandPx}" fill="${bandFill}" fill-opacity="0.55" stroke="${bandStroke}" stroke-width="2"/>`,
        `<text x="${(x0 + x1) / 2}" y="${y1 + 34}" font-family="sans-serif" font-size="19" font-weight="bold" fill="${wallColor}" text-anchor="middle" style="text-transform:capitalize">${safe}</text>`,
      );
    } else if (pos === "left") {
      svg.push(
        `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="${wallColor}" stroke-width="${wallThick}" stroke-linecap="square"/>`,
        `<rect x="${x0 + wallThick}" y="${y0 + wallThick}" width="${bandPx}" height="${roomH - wallThick * 2}" fill="${bandFill}" fill-opacity="0.55" stroke="${bandStroke}" stroke-width="2"/>`,
        `<text x="${x0 - 18}" y="${(y0 + y1) / 2}" font-family="sans-serif" font-size="19" font-weight="bold" fill="${wallColor}" text-anchor="middle" transform="rotate(-90 ${x0 - 18} ${(y0 + y1) / 2})" style="text-transform:capitalize">${safe}</text>`,
      );
    } else {
      svg.push(
        `<line x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${wallColor}" stroke-width="${wallThick}" stroke-linecap="square"/>`,
        `<rect x="${x1 - wallThick - bandPx}" y="${y0 + wallThick}" width="${bandPx}" height="${roomH - wallThick * 2}" fill="${bandFill}" fill-opacity="0.55" stroke="${bandStroke}" stroke-width="2"/>`,
        `<text x="${x1 + 18}" y="${(y0 + y1) / 2}" font-family="sans-serif" font-size="19" font-weight="bold" fill="${wallColor}" text-anchor="middle" transform="rotate(90 ${x1 + 18} ${(y0 + y1) / 2})" style="text-transform:capitalize">${safe}</text>`,
      );
    }
  };

  labels.forEach((label, i) => drawWall(positions[i], label));

  // Assumed-footprint dimensions (the room size is assumed, not measured —
  // the "?" marks it for the site measure). Top = width, left = depth.
  const dimC = "#6a4a8f";
  const tick = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${dimC}" stroke-width="2"/>`;
  const assumedWIn = Math.round(roomW / pxPerIn);
  const assumedHIn = Math.round(roomH / pxPerIn);
  const topDimY = y0 - 44;
  svg.push(
    `<line x1="${x0}" y1="${topDimY}" x2="${x1}" y2="${topDimY}" stroke="${dimC}" stroke-width="1.5"/>`,
    tick(x0 - 5, topDimY + 5, x0 + 5, topDimY - 5),
    tick(x1 - 5, topDimY + 5, x1 + 5, topDimY - 5),
    `<text x="${(x0 + x1) / 2}" y="${topDimY - 10}" font-family="monospace" font-size="16" font-weight="bold" fill="#31184a" text-anchor="middle">~${assumedWIn}" ?</text>`,
  );
  const leftDimX = x0 - 64;
  svg.push(
    `<line x1="${leftDimX}" y1="${y0}" x2="${leftDimX}" y2="${y1}" stroke="${dimC}" stroke-width="1.5"/>`,
    tick(leftDimX - 5, y0 + 5, leftDimX + 5, y0 - 5),
    tick(leftDimX - 5, y1 + 5, leftDimX + 5, y1 - 5),
    `<text x="${leftDimX - 12}" y="${(y0 + y1) / 2}" font-family="monospace" font-size="16" font-weight="bold" fill="#31184a" text-anchor="middle" transform="rotate(-90 ${leftDimX - 12} ${(y0 + y1) / 2})">~${assumedHIn}" ?</text>`,
  );

  // Corner dots at wall junctions.
  const corners: Array<[number, number]> = [];
  if (posSet.has("top") && posSet.has("left")) corners.push([x0, y0]);
  if (posSet.has("top") && posSet.has("right")) corners.push([x1, y0]);
  if (posSet.has("bottom") && posSet.has("left")) corners.push([x0, y1]);
  if (posSet.has("bottom") && posSet.has("right")) corners.push([x1, y1]);
  for (const [cx, cy] of corners) {
    svg.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="${wallColor}"/>`);
  }

  // Legend.
  const legY = y1 + 58;
  svg.push(
    `<rect x="${x0}" y="${legY - 14}" width="26" height="16" fill="${bandFill}" fill-opacity="0.55" stroke="${bandStroke}" stroke-width="2"/>`,
    `<text x="${x0 + 34}" y="${legY}" font-family="sans-serif" font-size="15" fill="#31184a">${esc(mwLabel)} · ${depthIn}" deep</text>`,
    `<text x="${x1}" y="${legY}" font-family="sans-serif" font-size="15" fill="#6a4a8f" text-anchor="end">Assumed ${esc(shape)} · not to scale · verify on site</text>`,
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

  return { mimeType: "image/png", dataBase64: png.toString("base64") };
}
