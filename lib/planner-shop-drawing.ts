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

import type { PlannerVisualSpec, MillworkZone } from "@/lib/planner-visual-spec";
import { ensurePlannerFonts, svgFontStyle } from "./planner-svg-font";

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
  /**
   * Stamp the sheet as verified against the site measure (used by the
   * fabrication PDF). Defaults to the preliminary stamp.
   */
  verified?: boolean;
}): Promise<ShopDrawingResult | null> {
  const spec = params.spec;
  // Debug: log spec fields that drive zone selection
  console.log("[elevation] designCategory:", spec.designCategory, "| scopeNotes:", (spec.scopeNotes ?? "").slice(0, 80), "| shelfCount:", spec.shelfCount, "| zones:", spec.zones ? spec.zones.length : "null");
  const label = (params.wallLabel || "wall").trim();
  const project = (params.projectName || "RESIDENTIAL MILLWORK").trim().toUpperCase();

  const wallWIn = spec.width ?? 96;
  const wallHIn = spec.height ?? 96;
  const widthKnown = spec.width !== null;
  const heightKnown = spec.height !== null;

  // Sheet layout: drawing area + tag column + title block column.
  // Zones add a second dimension chain up top — give it headroom.
  const hasZones = !!(spec.zones && spec.zones.length > 0) || /closet|wardrobe/i.test(spec.designCategory ?? "");
  const titleW = 380;
  const tagColW = 140;
  const mTop = hasZones ? 200 : 150;
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
    svgFontStyle(),
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${mLeft}" y="44" font-family="DejaVu Sans" font-size="26" font-weight="bold" fill="${INK}" letter-spacing="2">ELEVATION — ${esc(label).toUpperCase()}</text>`,
    `<text x="${mLeft}" y="68" font-family="DejaVu Sans" font-size="13" fill="${DIM}" letter-spacing="1">${params.verified ? "SHOP DRAWING — VERIFIED AGAINST SITE MEASURE" : "SHOP DRAWING — PRELIMINARY · VERIFY ALL DIMENSIONS ON SITE BEFORE FABRICATION"}</text>`,
  );

  // Wall outline + floor.
  svg.push(
    `<rect x="${f1(wx0)}" y="${f1(wy0)}" width="${f1(wallPxW)}" height="${f1(wallPxH)}" fill="#ffffff" stroke="${INK}" stroke-width="3"/>`,
    `<line x1="${f1(wx0 - 40)}" y1="${f1(wy1)}" x2="${f1(wx1 + 40)}" y2="${f1(wy1)}" stroke="${INK}" stroke-width="4"/>`,
    `<text x="${f1(wx0 - 8)}" y="${f1(wy1 + 22)}" font-family="DejaVu Sans" font-size="13" fill="${DIM}" text-anchor="end">F.F.</text>`,
  );

  // ---- Millwork ----
  // Zone-aware rendering: closets and built-ins draw their functional zones
  // (shelf towers, hanging sections with rods, shoe cubbies, drawers).
  // Non-zoned shelf designs use the legacy centered-shelf layout.
  const isCloset = /closet|wardrobe/i.test(spec.designCategory ?? "");
  let zones: MillworkZone[] | null = spec.zones && spec.zones.length > 0 ? spec.zones : null;
  let zonesAssumed = false;
  if (!zones && isCloset) {
    // Use vision-derived closet layout when available (e.g. ["DOUBLE-HANG", "DRAWERS", "SINGLE-HANG"])
    // for an accurate section-by-section elevation. Falls back to a generic
    // assumed layout when vision didn't provide one.
    if (spec.closetLayout && spec.closetLayout.length > 0) {
      const layout = spec.closetLayout;
      const n = layout.length;
      zones = layout.map((section, i) => {
        const x0 = i / n;
        const x1 = (i + 1) / n;
        switch (section) {
          case "DOUBLE-HANG":
            return { kind: "hanging", x0, x1, rods: 2, assumed: false };
          case "SINGLE-HANG":
            return { kind: "hanging", x0, x1, rods: 1, assumed: false };
          case "SHELVES":
            return { kind: "shelf-tower", x0, x1, shelves: 5, assumed: false };
          case "DRAWERS":
            return { kind: "drawers", x0, x1, drawers: 3, assumed: false };
          case "SHOES":
            return { kind: "shoe-cubbies", x0, x1, rows: 2, assumed: false };
          default:
            return { kind: "shelf-tower", x0, x1, shelves: 4, assumed: true };
        }
      });
      // Add a top shelf spanning full width (typical closet) if not already covered
      zonesAssumed = false;
    } else {
      // Fallback: a representative closet layout so the sheet shows the
      // actual design instead of an empty box. Every dim is marked assumed.
      const towerShelves =
        spec.shelfCount && spec.shelfCount > 0 ? Math.min(Math.round(spec.shelfCount), 8) : 5;
      const rods =
        spec.closetRodCount && spec.closetRodCount > 0 ? Math.round(spec.closetRodCount) : 2;
      zones = [
        { kind: "shelf-tower", x0: 0, x1: 0.38, shelves: towerShelves, assumed: true },
        { kind: "hanging", x0: 0.38, x1: 1, rods, assumed: true },
        { kind: "shoe-cubbies", x0: 0, x1: 1, rows: 2, assumed: true },
      ];
      zonesAssumed = true;
    }
  }

  type Part = { tag: string; hIn: number; y: number; cx: number };
  const parts: Part[] = [];
  // Shelf tag counter (bottom-up across all zones); rods/drws have own series.
  let shN = 0;
  let rdN = 0;
  let drN = 0;

  const shelfThickPx = Math.max(9, 1.5 * pxPerIn);
  const drawShelf = (x0: number, lenPx: number, y: number, tag: string, hIn: number) => {
    svg.push(
      `<rect x="${f1(x0)}" y="${f1(y - shelfThickPx / 2)}" width="${f1(lenPx)}" height="${f1(shelfThickPx)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
    );
    parts.push({ tag, hIn, y, cx: x0 + lenPx / 2 });
    dimensions.push({ name: `${tag} height A.F.F.`, expectedIn: r1(hIn), known: !zonesAssumed });
  };
  const drawRod = (x0: number, lenPx: number, y: number, hIn: number) => {
    rdN += 1;
    const tag = `RD-${rdN}`;
    // Rod: double line (pipe) + hanger ticks every ~14 px.
    svg.push(
      `<line x1="${f1(x0)}" y1="${f1(y - 2.5)}" x2="${f1(x0 + lenPx)}" y2="${f1(y - 2.5)}" stroke="${MILL_EDGE}" stroke-width="2"/>`,
      `<line x1="${f1(x0)}" y1="${f1(y + 2.5)}" x2="${f1(x0 + lenPx)}" y2="${f1(y + 2.5)}" stroke="${MILL_EDGE}" stroke-width="2"/>`,
    );
    for (let hx = x0 + 10; hx < x0 + lenPx - 6; hx += 14) {
      svg.push(
        `<line x1="${f1(hx)}" y1="${f1(y + 2.5)}" x2="${f1(hx)}" y2="${f1(y + 16)}" stroke="${DIM}" stroke-width="1.5"/>`,
      );
    }
    parts.push({ tag, hIn, y, cx: x0 + lenPx / 2 });
    dimensions.push({ name: `${tag} height A.F.F.`, expectedIn: r1(hIn), known: !zonesAssumed });
  };

  // Built-in fallback: when vision zones aren't available but this is a
  // built-in (bookcase, sideboard, wall unit) with a known shelf count,
  // generate deterministic bays instead of the 2-shelf empty box.
  // This uses the reliable shelf count, not flaky vision JSON.
  const isBuiltIn = /built-?in|bookcase|sideboard|wall unit|display cabinet/i.test(
    `${spec.designCategory ?? ""} ${spec.scopeNotes ?? ""}`,
  );
  if (!zones && isBuiltIn && (spec.shelfCount ?? 0) >= 4) {
    const totalShelves = spec.shelfCount!;
    // 3-4 bays is typical for a built-in; distribute shelves evenly.
    const bayCount = totalShelves >= 12 ? 4 : 3;
    const perBay = Math.round(totalShelves / bayCount);
    const hasBase = /sideboard|cabinet|drawers?|doors?/i.test(
      `${spec.designCategory ?? ""} ${spec.scopeNotes ?? ""}`,
    );
    zones = [
      {
        kind: "built-in-bays",
        x0: 0,
        x1: 1,
        bays: Array.from({ length: bayCount }, (_, i) => ({
          x0: i / bayCount,
          x1: (i + 1) / bayCount,
          shelves: perBay,
          baseCabinet: hasBase ? { doors: 1, drawers: 0 } : undefined,
        })),
        assumed: true,
      },
    ];
    zonesAssumed = true;
  }

  // Floating shelf mode: for media walls, floating shelves, accent walls,
  // and any shelf-heavy design that isn't a built-in case. Draws shelves as
  // horizontal boards on the wall (no case box), with optional grouping
  // (e.g. shelves flanking a TV) and a base cabinet.
  const designText = `${spec.designCategory ?? ""} ${spec.scopeNotes ?? ""}`;
  const isFloating = /media wall|floating shelves?|accent wall|tv wall/i.test(designText) ||
    // Fallback: shelf-heavy but not a built-in case → floating shelves
    ((spec.shelfCount ?? 0) >= 4 && !/built-?in|bookcase|sideboard|wall unit|display cabinet|closet|wardrobe/i.test(designText));
  if (!zones && isFloating && (spec.shelfCount ?? 0) >= 2) {
    const totalShelves = spec.shelfCount!;
    const hasBase = /credenza|console|cabinet|sideboard/i.test(
      `${spec.designCategory ?? ""} ${spec.scopeNotes ?? ""}`,
    );
    const isMediaWall = /media wall|tv/i.test(
      `${spec.designCategory ?? ""} ${spec.scopeNotes ?? ""}`,
    );

    if (isMediaWall && totalShelves >= 4 && totalShelves % 2 === 0) {
      // Media wall: split shelves into left/right groups flanking the TV.
      const perSide = totalShelves / 2;
      zones = [
        { kind: "floating-shelves", x0: 0, x1: 0.32, shelves: perSide, assumed: true },
        { kind: "floating-shelves", x0: 0.68, x1: 1, shelves: perSide, assumed: true },
      ];
      if (hasBase) {
        zones.push({ kind: "base-cabinets", x0: 0, x1: 1, assumed: true });
      }
    } else {
      // Single group of floating shelves centered on the wall.
      zones = [
        { kind: "floating-shelves", x0: 0.15, x1: 0.85, shelves: totalShelves, assumed: true },
      ];
      if (hasBase) {
        zones.push({ kind: "base-cabinets", x0: 0.15, x1: 0.85, assumed: true });
      }
    }
    zonesAssumed = true;
  }

  // Legacy shelf path (non-closet, no zones) — unchanged behavior.
  const shelfLike = /shelves?|shelving|bookcase/i.test(spec.designCategory ?? "");
  const shelfCountAssumed = !zones && (spec.shelfCount ?? 0) <= 0 && shelfLike;
  const shelfCount = spec.shelfCount && spec.shelfCount > 0 ? spec.shelfCount : shelfLike && !zones ? 2 : 0;
  const spanIn = spec.shelfBoardSpanAlongWallIn ?? Math.min(wallWIn * 0.55, 48);
  const spacingIn = spec.shelfVerticalSpacingIn ?? null;
  type Shelf = { x: number; y: number; lenPx: number; hIn: number; lenIn: number; tag: string };
  const shelves: Shelf[] = [];

  if (zones) {
    // Shoe cubbies render as a bottom band; other zones sit above it.
    const shoeZone = zones.find((z) => z.kind === "shoe-cubbies");
    const shoeHIn = 22;
    const shoeTopY = shoeZone ? wy1 - shoeHIn * pxPerIn : wy1;
    const contentTopY = wy0 + 24;

    if (shoeZone) {
      const rows = shoeZone.rows ?? 2;
      const zx0 = wx0 + shoeZone.x0 * wallPxW;
      const zx1 = wx0 + shoeZone.x1 * wallPxW;
      const bandH = wy1 - shoeTopY;
      const rowH = bandH / rows;
      const colW = Math.min(16 * pxPerIn, (zx1 - zx0) / 4);
      const nCols = Math.max(2, Math.floor((zx1 - zx0) / colW));
      const cw = (zx1 - zx0) / nCols;
      svg.push(
        `<rect x="${f1(zx0)}" y="${f1(shoeTopY)}" width="${f1(zx1 - zx0)}" height="${f1(bandH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
      );
      for (let c = 1; c < nCols; c++) {
        const cx = zx0 + c * cw;
        svg.push(`<line x1="${f1(cx)}" y1="${f1(shoeTopY)}" x2="${f1(cx)}" y2="${f1(wy1)}" stroke="${MILL_EDGE}" stroke-width="1.5"/>`);
      }
      for (let r = 1; r < rows; r++) {
        const ry = shoeTopY + r * rowH;
        svg.push(`<line x1="${f1(zx0)}" y1="${f1(ry)}" x2="${f1(zx1)}" y2="${f1(ry)}" stroke="${MILL_EDGE}" stroke-width="1.5"/>`);
      }
      const cbx = (zx0 + zx1) / 2;
      const cby = (shoeTopY + wy1) / 2;
      svg.push(
        `<circle cx="${f1(cbx)}" cy="${f1(cby)}" r="20" fill="${TAG_FILL}" stroke="${INK}" stroke-width="2"/>`,
        `<text x="${f1(cbx)}" y="${f1(cby + 5)}" font-family="DejaVu Sans Mono" font-size="14" font-weight="bold" fill="${INK}" text-anchor="middle">CB-1</text>`,
      );
      dimensions.push({ name: "Shoe cubby bank height", expectedIn: shoeHIn, known: !zonesAssumed });
    }

    // Vertical dividers between side-by-side zones.
    const dividers = new Set<number>();
    for (const z of zones) {
      if (z.kind === "shoe-cubbies") continue;
      dividers.add(z.x0);
      dividers.add(z.x1);
    }
    for (const dx of dividers) {
      if (dx <= 0.001 || dx >= 0.999) continue;
      const px = wx0 + dx * wallPxW;
      svg.push(
        `<line x1="${f1(px)}" y1="${f1(wy0)}" x2="${f1(px)}" y2="${f1(shoeTopY)}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
      );
    }

    for (const z of zones) {
      if (z.kind === "shoe-cubbies") continue;
      const zx0 = wx0 + z.x0 * wallPxW + 4;
      const zx1 = wx0 + z.x1 * wallPxW - 4;
      const zw = zx1 - zx0;
      if (zw < 20) continue;
      if (z.kind === "shelf-tower" || z.kind === "open-shelves") {
        const n = Math.max(1, Math.min(10, Math.round(z.shelves ?? 4)));
        for (let i = 0; i < n; i++) {
          // Bottom-up: first shelf lowest.
          const hIn = 24 + (i * (78 - 24)) / Math.max(1, n - 1);
          const y = wy1 - hIn * pxPerIn;
          if (y < contentTopY || y > shoeTopY - 6) continue;
          shN += 1;
          drawShelf(zx0, zw, y, `SH-${shN}`, hIn);
          dimensions.push({ name: `SH-${shN} length`, expectedIn: r1(zw / pxPerIn), known: !zonesAssumed });
        }
      } else if (z.kind === "hanging") {
        const nRods = Math.max(1, Math.min(3, Math.round(z.rods ?? 2)));
        const rodHeights = nRods === 1 ? [66] : nRods === 2 ? [64, 32] : [80, 52, 30];
        for (const hIn of rodHeights.slice(0, nRods)) {
          const y = wy1 - hIn * pxPerIn;
          if (y < contentTopY || y > shoeTopY - 10) continue;
          drawRod(zx0, zw, y, hIn);
        }
        // Top shelf above the rods.
        const topY = wy1 - 80 * pxPerIn;
        if (topY > contentTopY && nRods <= 2) {
          shN += 1;
          drawShelf(zx0, zw, topY, `SH-${shN}`, 80);
        }
      } else if (z.kind === "drawers") {
        const nD = Math.max(1, Math.min(6, Math.round(z.drawers ?? 3)));
        const drH = 9 * pxPerIn;
        let y = shoeTopY - 6;
        for (let i = 0; i < nD; i++) {
          const yTop = y - drH;
          if (yTop < contentTopY) break;
          drN += 1;
          const tag = `DR-${drN}`;
          svg.push(
            `<rect x="${f1(zx0)}" y="${f1(yTop)}" width="${f1(zw)}" height="${f1(drH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
            `<line x1="${f1(zx0 + zw / 2 - 14)}" y1="${f1(yTop + drH / 2)}" x2="${f1(zx0 + zw / 2 + 14)}" y2="${f1(yTop + drH / 2)}" stroke="${MILL_EDGE}" stroke-width="3"/>`,
          );
          const hIn = (wy1 - (yTop + drH / 2)) / pxPerIn;
          parts.push({ tag, hIn, y: yTop + drH / 2, cx: zx0 + zw / 2 });
          dimensions.push({ name: `${tag} center A.F.F.`, expectedIn: r1(hIn), known: !zonesAssumed });
          y = yTop - 4;
        }
      } else if (z.kind === "base-cabinets") {
        // Base cabinet/credenza: low rectangle spanning the zone width.
        const cabHIn = 24;
        const cabH = cabHIn * pxPerIn;
        const yTop = wy1 - cabH;
        svg.push(
          `<rect x="${f1(zx0)}" y="${f1(yTop)}" width="${f1(zw)}" height="${f1(cabH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
        );
        // Door divisions (assume 4 doors)
        for (let di = 1; di < 4; di++) {
          const dx = zx0 + (di * zw) / 4;
          svg.push(`<line x1="${f1(dx)}" y1="${f1(yTop)}" x2="${f1(dx)}" y2="${f1(wy1)}" stroke="${MILL_EDGE}" stroke-width="1.5"/>`);
        }
        dimensions.push({ name: "Base cabinet height", expectedIn: cabHIn, known: !zonesAssumed });
        dimensions.push({ name: "Base cabinet width", expectedIn: r1(zw / pxPerIn), known: !zonesAssumed });
      } else if (z.kind === "floating-shelves") {
        // Floating shelves: horizontal boards mounted on the wall, no case.
        // Drawn as thick lines at their heights within the zone's x-range.
        const n = Math.max(1, Math.min(10, Math.round(z.shelves ?? 3)));
        for (let i = 0; i < n; i++) {
          const hIn = 30 + (i * (72 - 30)) / Math.max(1, n - 1);
          const y = wy1 - hIn * pxPerIn;
          if (y < wy0 + 10 || y > wy1 - 10) continue;
          shN += 1;
          // Shelf board: thick horizontal line with slight depth indication
          svg.push(
            `<rect x="${f1(zx0)}" y="${f1(y - shelfThickPx / 2)}" width="${f1(zw)}" height="${f1(shelfThickPx)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
          );
          parts.push({ tag: `SH-${shN}`, hIn, y, cx: zx0 + zw / 2 });
          dimensions.push({ name: `SH-${shN} height A.F.F.`, expectedIn: r1(hIn), known: !zonesAssumed });
          dimensions.push({ name: `SH-${shN} length`, expectedIn: r1(zw / pxPerIn), known: !zonesAssumed });
        }
      } else if (z.kind === "built-in-bays" && z.bays && z.bays.length > 0) {
        // Vision-grounded built-in: vertical bays with per-bay shelf counts
        // and optional base cabinets. This is what makes the elevation match
        // the concept image instead of drawing a generic empty box.
        const bays = z.bays;
        for (const bay of bays) {
          const bx0 = zx0 + bay.x0 * zw;
          const bx1 = zx0 + bay.x1 * zw;
          const bw = bx1 - bx0;
          if (bw < 16) continue;
          // Bay vertical dividers.
          svg.push(
            `<line x1="${f1(bx0)}" y1="${f1(wy0)}" x2="${f1(bx0)}" y2="${f1(shoeTopY)}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
            `<line x1="${f1(bx1)}" y1="${f1(wy0)}" x2="${f1(bx1)}" y2="${f1(shoeTopY)}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
          );
          // Base cabinet below (if any): box with door/drawer front lines.
          let shelfTopY = shoeTopY;
          const bc = bay.baseCabinet;
          if (bc && (bc.doors > 0 || bc.drawers > 0)) {
            const cabHIn = 30;
            const cabTopY = shoeTopY - cabHIn * pxPerIn;
            const fronts = Math.max(1, bc.doors + bc.drawers);
            const fw = bw / fronts;
            svg.push(
              `<rect x="${f1(bx0)}" y="${f1(cabTopY)}" width="${f1(bw)}" height="${f1(shoeTopY - cabTopY)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`,
            );
            for (let fi = 1; fi < fronts; fi++) {
              const fx = bx0 + fi * fw;
              svg.push(`<line x1="${f1(fx)}" y1="${f1(cabTopY)}" x2="${f1(fx)}" y2="${f1(shoeTopY)}" stroke="${MILL_EDGE}" stroke-width="1.5"/>`);
            }
            // Drawer fronts get a pull line; doors are plain.
            for (let fi = 0; fi < fronts; fi++) {
              if (fi < bc.drawers) {
                const fx0 = bx0 + fi * fw;
                svg.push(`<line x1="${f1(fx0 + fw / 2 - 12)}" y1="${f1(cabTopY + 14)}" x2="${f1(fx0 + fw / 2 + 12)}" y2="${f1(cabTopY + 14)}" stroke="${MILL_EDGE}" stroke-width="2.5"/>`);
              }
            }
            shelfTopY = cabTopY;
            dimensions.push({ name: "Base cabinet height", expectedIn: cabHIn, known: !zonesAssumed });
          }
          // Shelves within the bay, bottom-up above the base cabinet.
          const n = Math.max(0, Math.min(10, Math.round(bay.shelves)));
          if (n > 0) {
            const topIn = (wy1 - contentTopY) / pxPerIn - 6;
            const botIn = (wy1 - shelfTopY) / pxPerIn + 4;
            for (let i = 0; i < n; i++) {
              const hIn = n === 1 ? (topIn + botIn) / 2 : botIn + (i * (topIn - botIn)) / (n - 1);
              const y = wy1 - hIn * pxPerIn;
              if (y < contentTopY || y > shelfTopY - 4) continue;
              shN += 1;
              drawShelf(bx0 + 3, bw - 6, y, `SH-${shN}`, hIn);
              dimensions.push({ name: `SH-${shN} length`, expectedIn: r1((bw - 6) / pxPerIn), known: !zonesAssumed });
            }
          }
        }
      }
    }
    // Part tags with leaders in the tag column (collision-avoided:
    // nudged down when two parts are close vertically).
    const tagParts = parts.slice().sort((a, b) => a.y - b.y);
    let lastTagY = -100;
    for (const p of tagParts) {
      const tx = wx1 + tagColW / 2;
      let ty = p.y;
      if (ty < lastTagY + 44) ty = lastTagY + 44;
      lastTagY = ty;
      svg.push(
        `<line x1="${f1(p.cx)}" y1="${f1(p.y)}" x2="${f1(tx - 34)}" y2="${f1(ty)}" stroke="${DIM}" stroke-width="1.25"/>`,
        `<circle cx="${f1(tx)}" cy="${f1(ty)}" r="20" fill="${TAG_FILL}" stroke="${INK}" stroke-width="2"/>`,
        `<text x="${f1(tx)}" y="${f1(ty + 5)}" font-family="DejaVu Sans Mono" font-size="14" font-weight="bold" fill="${INK}" text-anchor="middle">${p.tag}</text>`,
      );
    }
  } else if (shelfCount > 0 && shelfCount <= 12) {
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
      // Bottom-up: SH-1 is the lowest shelf.
      ysIn = Array.from({ length: n }, (_, i) => zTop + (i * (zBot - zTop)) / (n - 1));
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
      dimensions.push({ name: `Shelf ${si} height A.F.F.`, expectedIn: r1(hIn), known: !shelfCountAssumed });
      dimensions.push({ name: `Shelf ${si} length (${tag})`, expectedIn: r1(lenIn), known: !shelfCountAssumed });
    }
    // Part tags with leaders in the dedicated tag column (right of wall, left of title block).
    shelves.forEach((s) => {
      const tx = wx1 + tagColW / 2;
      const ty = s.y;
      svg.push(
        `<line x1="${f1(s.x + s.lenPx)}" y1="${f1(s.y)}" x2="${f1(tx - 34)}" y2="${f1(ty)}" stroke="${DIM}" stroke-width="1.25"/>`,
        `<circle cx="${f1(tx)}" cy="${f1(ty)}" r="20" fill="${TAG_FILL}" stroke="${INK}" stroke-width="2"/>`,
        `<text x="${f1(tx)}" y="${f1(ty + 5)}" font-family="DejaVu Sans Mono" font-size="14" font-weight="bold" fill="${INK}" text-anchor="middle">${s.tag}</text>`,
      );
    });
  } else {
    const bandH = Math.min(wallPxH * 0.3, 130);
    svg.push(
      `<rect x="${f1(wx0 + wallPxW * 0.08)}" y="${f1(wy1 - bandH - wallPxH * 0.12)}" width="${f1(wallPxW * 0.84)}" height="${f1(bandH)}" fill="${MILL_FILL}" stroke="${MILL_EDGE}" stroke-width="2" stroke-dasharray="10 6"/>`,
      `<text x="${f1(wx0 + wallPxW / 2)}" y="${f1(wy1 - bandH / 2 + 5)}" font-family="DejaVu Sans" font-size="15" fill="${INK}" text-anchor="middle">MILLWORK — PER APPROVED DESIGN</text>`,
    );
  }
  if (spec.depth !== null) {
    dimensions.push({ name: "Millwork depth", expectedIn: r1(spec.depth), known: true });
  }
  // Fabrication standards from the section/cut-list sheets — Tom confirms
  // these on site (confirm-only, any positive value passes).
  if (shelves.length > 0 || parts.some((p) => p.tag.startsWith("SH-"))) {
    dimensions.push({ name: "Shelf board thickness", expectedIn: 1.5, known: false });
    dimensions.push({ name: "French cleat stock", expectedIn: 0.75, known: false });
  }
  if (parts.some((p) => p.tag.startsWith("RD-"))) {
    dimensions.push({ name: "Closet rod", expectedIn: 1.25, known: false });
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
  if (zones) {
    // Zone widths along the top chain.
    const sorted = zones
      .filter((z) => z.kind !== "shoe-cubbies")
      .slice()
      .sort((a, b) => a.x0 - b.x0);
    const zpts = [wx0];
    const zvals: number[] = [];
    for (const z of sorted) {
      zvals.push((z.x1 - z.x0) * wallWIn);
      const px = wx0 + z.x1 * wallPxW;
      if (px < wx1 - 4) zpts.push(px);
    }
    zpts.push(wx1);
    if (zpts.length > 2 || zvals.length > 1) {
      zpts.push(wx1);
      svg.push(
        `<line x1="${f1(wx0)}" y1="${f1(chainY)}" x2="${f1(wx1)}" y2="${f1(chainY)}" stroke="${DIM}" stroke-width="1.25"/>`,
      );
      zpts.forEach((px) => {
        svg.push(
          `<line x1="${f1(px)}" y1="${f1(topY - 6)}" x2="${f1(px)}" y2="${f1(chainY + 8)}" stroke="${DIM}" stroke-width="1"/>`,
          tickH(px, chainY),
        );
      });
      for (let i = 0; i < zvals.length; i++) {
        const cx = (zpts[i] + zpts[i + 1]) / 2;
        const v = zvals[i];
        if (v >= 1) svg.push(dimLabel(cx, chainY - 9, fmtFractional(v) + (zonesAssumed ? " *" : ""), 13, false));
      }
      dimensions.push({ name: "Zone widths per plan", expectedIn: r1(wallWIn), known: !zonesAssumed });
    }
  } else if (shelves.length > 0) {
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
  // Per-part heights as a running chain on the outer column (bottom-up).
  // Zones: shelves + rods + drawer centers. Legacy: shelves.
  const chainParts = zones
    ? (() => {
        // Zone drawings have many parts — the left chain shows only the
        // critical datums (rod heights, tower top/bottom shelves). Every
        // part height is still in the dimensions checklist.
        const all = parts.slice().sort((a, b) => b.y - a.y);
        const shTags = all.filter((p) => p.tag.startsWith("SH-"));
        const keep = new Set<string>();
        for (const p of all) {
          if (p.tag.startsWith("RD-") || p.tag.startsWith("DR-")) keep.add(p.tag);
        }
        if (shTags.length > 0) {
          keep.add(shTags[0].tag);
          keep.add(shTags[shTags.length - 1].tag);
        }
        return all.filter((p) => keep.has(p.tag));
      })()
    : shelves.slice().sort((a, b) => b.y - a.y).map((s) => ({ tag: s.tag, hIn: s.hIn, y: s.y, cx: s.x }));
  const chainAssumed = zones ? zonesAssumed : shelfCountAssumed;
  if (chainParts.length > 0) {
    svg.push(
      `<line x1="${f1(leftChainX)}" y1="${f1(chainParts[0].y)}" x2="${f1(leftChainX)}" y2="${f1(wy1)}" stroke="${DIM}" stroke-width="1.25"/>`,
    );
    for (const s of chainParts) tickV(leftChainX, s.y);
    tickV(leftChainX, wy1);
    chainParts.forEach((s, i) => {
      const belowY = i === 0 ? wy1 : chainParts[i - 1].y;
      // Stagger labels alternately left/right of the chain — zone drawings
      // have many parts and rotated labels would otherwise collide.
      const stagger = zones && i % 2 === 1;
      const lx = stagger ? leftChainX + 14 : leftChainX - 12;
      svg.push(
        `<line x1="${f1(s.cx - 4)}" y1="${f1(s.y)}" x2="${f1(leftChainX - 8)}" y2="${f1(s.y)}" stroke="${DIM}" stroke-width="1" stroke-dasharray="5 4"/>`,
        dimLabelV(lx, (s.y + belowY) / 2, `${s.tag} ` + fmtFractional(s.hIn) + (chainAssumed ? " *" : ""), 10, false),
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
    `<text x="${tbX + 14}" y="${tbY + 40}" font-family="DejaVu Sans" font-size="20" font-weight="bold" fill="${INK}" letter-spacing="3">LEVEL UP INSTALL</text>`,
  );
  rows.forEach(([k, v], i) => {
    const ry = tbY + 64 + i * rowH;
    svg.push(
      `<line x1="${tbX}" y1="${ry}" x2="${tbX + tbW}" y2="${ry}" stroke="${INK}" stroke-width="1"/>`,
      `<text x="${tbX + 12}" y="${ry + 18}" font-family="DejaVu Sans" font-size="11" fill="${DIM}" letter-spacing="1">${k}</text>`,
      `<text x="${tbX + 12}" y="${ry + 36}" font-family="DejaVu Sans" font-size="13" font-weight="bold" fill="${INK}">${v}</text>`,
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
      `<text x="${mLeft}" y="${notesY + i * 20}" font-family="DejaVu Sans" font-size="12.5" fill="${INK}">${esc(n)}</text>`,
    );
  });

  svg.push(`</svg>`);

  let png: Buffer;
  try {
    ensurePlannerFonts();
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
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="DejaVu Sans Mono" font-size="${size}" ${bold ? 'font-weight="bold"' : ""} fill="${INK}" text-anchor="middle">${esc(text)}</text>`;
}
function dimLabelV(x: number, y: number, text: string, size: number, bold: boolean): string {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="DejaVu Sans Mono" font-size="${size}" ${bold ? 'font-weight="bold"' : ""} fill="${INK}" text-anchor="middle" transform="rotate(-90 ${f1(x)} ${f1(y)})">${esc(text)}</text>`;
}
