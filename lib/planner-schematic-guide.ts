/**
 * Deterministic layout schematic for planner concept renders.
 *
 * Diffusion image models cannot reliably count repeated elements (shelves,
 * drawers) or hold inch proportions from text alone — "exactly 4 shelves"
 * in a prompt routinely renders 3 or 5. Instead of trusting the text,
 * we draw the exact geometry in code (SVG -> PNG via sharp) and attach it
 * as a binding reference image: the model copies the schematic's shelf
 * count, relative spans, and positions instead of inventing them.
 *
 * Only built when the extracted spec has a known shelf count; otherwise
 * there is nothing deterministic to enforce and we return null.
 */

import type { PlannerVisualSpec } from "@/lib/planner-visual-spec";
import type { RefinementGeometryIntent } from "@/lib/planner-refinement-geometry";

export type PlannerSchematicResult = {
  mimeType: "image/png";
  dataBase64: string;
  /** Shelf count drawn — for the binding prompt line. */
  shelfCount: number;
};

type SchematicIntent = Pick<
  RefinementGeometryIntent,
  "horizontalShift" | "verticalShift"
> | null;

const W = 1024;
const H = 768;
const MARGIN = 48;

/** Minimal structural type for the sharp call chain we use. */
type SharpLike = (input: Buffer) => {
  png: () => { toBuffer: () => Promise<Buffer> };
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the schematic PNG. Returns null when there is no shelf count to
 * enforce (nothing deterministic to draw).
 */
export async function buildPlannerSchematicGuide(
  spec: PlannerVisualSpec,
  intent: SchematicIntent = null,
): Promise<PlannerSchematicResult | null> {
  const count = spec.shelfCount;
  if (count === null || !Number.isFinite(count) || count < 1 || count > 12) {
    return null;
  }
  const n = Math.round(count);

  // Horizontal span: per-shelf board length relative to the wall run.
  const refWidthIn = spec.width ?? spec.shelfBoardSpanAlongWallIn ?? 96;
  const spanIn = spec.shelfBoardSpanAlongWallIn ?? refWidthIn * 0.55;
  const spanFrac = clamp(spanIn / Math.max(refWidthIn, 1), 0.1, 1);

  const wallX0 = MARGIN;
  const wallX1 = W - MARGIN;
  const wallW = wallX1 - wallX0;
  const shelfLenPx = wallW * spanFrac;

  // Horizontal placement: centered by default; biased for left/right intents.
  let shelfX0: number;
  if (intent?.horizontalShift === "left") {
    shelfX0 = wallX0 + wallW * 0.04;
  } else if (intent?.horizontalShift === "right") {
    shelfX0 = wallX1 - shelfLenPx - wallW * 0.04;
  } else {
    shelfX0 = wallX0 + (wallW - shelfLenPx) / 2;
  }
  shelfX0 = clamp(shelfX0, wallX0, wallX1 - shelfLenPx);

  // Vertical zone: middle band of the wall; biased for up/down intents.
  const wallY0 = MARGIN + 30;
  const wallY1 = H - MARGIN - 60;
  const wallH = wallY1 - wallY0;
  let zoneTop: number;
  let zoneBottom: number;
  if (intent?.verticalShift === "up") {
    zoneTop = wallY0 + wallH * 0.05;
    zoneBottom = wallY0 + wallH * 0.55;
  } else if (intent?.verticalShift === "down") {
    zoneTop = wallY0 + wallH * 0.45;
    zoneBottom = wallY0 + wallH * 0.95;
  } else {
    zoneTop = wallY0 + wallH * 0.18;
    zoneBottom = wallY0 + wallH * 0.82;
  }

  // Tier Y positions: even spacing, or proportional to stated tier spacing.
  const ys: number[] = [];
  if (n === 1) {
    ys.push((zoneTop + zoneBottom) / 2);
  } else if (spec.shelfVerticalSpacingIn !== null && spec.shelfVerticalSpacingIn > 0) {
    const totalIn = spec.shelfVerticalSpacingIn * (n - 1);
    const zoneIn = Math.max(totalIn, 12);
    const scale = (zoneBottom - zoneTop) / zoneIn;
    const startY = zoneBottom - totalIn * scale;
    for (let i = 0; i < n; i++) {
      ys.push(startY + i * spec.shelfVerticalSpacingIn * scale);
    }
  } else {
    for (let i = 0; i < n; i++) {
      ys.push(zoneTop + (i * (zoneBottom - zoneTop)) / (n - 1));
    }
  }

  const shelfThick = 10;
  const shelfRects = ys
    .map((y, i) => {
      const label = `<text x="${(shelfX0 - 18).toFixed(1)}" y="${(y + 5).toFixed(1)}" font-family="monospace" font-size="22" font-weight="bold" fill="#111" text-anchor="end">${i + 1}</text>`;
      const bar = `<rect x="${shelfX0.toFixed(1)}" y="${(y - shelfThick / 2).toFixed(1)}" width="${shelfLenPx.toFixed(1)}" height="${shelfThick}" fill="#111" />`;
      return label + bar;
    })
    .join("\n");

  const dimBits: string[] = [];
  if (spec.width !== null) dimBits.push(`${Math.round(spec.width)}"W`);
  if (spec.height !== null) dimBits.push(`${Math.round(spec.height)}"H`);
  if (spec.depth !== null) dimBits.push(`${Math.round(spec.depth)}"D`);
  const titleLine1 = `SCHEMATIC — draw EXACTLY ${n} shelf board(s), numbered 1-${n}`;
  const titleLine2 = dimBits.length ? `(${dimBits.join(" × ")})` : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
    `<text x="${W / 2}" y="30" font-family="monospace" font-size="20" font-weight="bold" fill="#111" text-anchor="middle">${esc(titleLine1)}</text>` +
    (titleLine2
      ? `<text x="${W / 2}" y="54" font-family="monospace" font-size="16" fill="#444" text-anchor="middle">${esc(titleLine2)}</text>`
      : "") +
    `<rect x="${wallX0}" y="${wallY0}" width="${wallW}" height="${wallH}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="10 6"/>` +
    `<text x="${wallX0}" y="${wallY0 - 10}" font-family="monospace" font-size="16" fill="#666">wall</text>` +
    `<line x1="${wallX0}" y1="${wallY1 + 34}" x2="${wallX1}" y2="${wallY1 + 34}" stroke="#666" stroke-width="2"/>` +
    `<text x="${W / 2}" y="${wallY1 + 58}" font-family="monospace" font-size="16" fill="#666" text-anchor="middle">floor</text>` +
    shelfRects +
    `</svg>`;

  // Lazy-load sharp so unit tests / edge runtimes without the native
  // module don't fail at import time. Handle both ESM (.default) and
  // CJS (module.exports directly) interop shapes.
  let png: Buffer;
  try {
    const mod = (await import("sharp")) as unknown as
      | { default: SharpLike }
      | SharpLike;
    const sharpFn: SharpLike | undefined =
      typeof mod === "function" ? mod : mod.default;
    if (typeof sharpFn !== "function") return null;
    png = await sharpFn(Buffer.from(svg)).png().toBuffer();
  } catch {
    return null;
  }

  return {
    mimeType: "image/png",
    dataBase64: png.toString("base64"),
    shelfCount: n,
  };
}

/** Binding instruction appended to the image prompt when a schematic is attached. */
export function buildSchematicBindingDirective(shelfCount: number): string {
  return [
    "MANDATORY — structural schematic attached (black-on-white line drawing, FIRST reference image):",
    `it shows EXACTLY ${shelfCount} numbered shelf board(s) — the render must contain exactly ${shelfCount} shelf boards, no more, no fewer;`,
    "copy the schematic's shelf count, relative board lengths, horizontal placement, and vertical tier positions into the photorealistic render;",
    "use the room photo(s) for perspective, surfaces, and lighting only — do not invent a different shelf layout than the schematic.",
  ].join(" ");
}
