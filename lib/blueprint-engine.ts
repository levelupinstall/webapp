import type { DesignCategoryBucket } from "@/lib/planner-visual-spec";

/** High-level carpentry blueprint mode for geometry generation. */
export type BlueprintUniversalCategory =
  | "SHELVING"
  | "CLOSET"
  | "TRIM_MOLDING"
  | "MIRRORS_TV"
  | "GENERIC";

/** Normalized elevation coordinates: x 0 = left, 1 = right; y 0 = floor, 1 = ceiling. */
export type BlueprintLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** Axis-aligned rectangle: (x,y) = bottom-left in normalized space; h extends upward. */
export type BlueprintRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** When true, draw dashed outline (no-build / collision hint). */
  dashed?: boolean;
};

export type BlueprintPlan = {
  category: BlueprintUniversalCategory;
  lines: BlueprintLine[];
  rects: BlueprintRect[];
  /** Outlets / switches — same stroke as structure; dashed to read as “no build”. */
  noBuildZones: BlueprintRect[];
  meta: {
    widthIn: number;
    heightIn: number;
    depthIn?: number | null;
    notes: string[];
  };
};

export type UniversalBlueprintSpecs = {
  widthIn: number;
  heightIn: number;
  depthIn?: number | null;
  shelfCount?: number | null;
  shelfPattern?: "stacked" | "staggered" | "wall_to_wall" | null;
  drawerCount?: number | null;
  closetRodCount?: number | null;
  /** Optional transcript slice for pattern / obstruction heuristics. */
  transcriptHint?: string;
};

const MAX_SHELVES = 48;

export function mapDesignBucketToUniversalCategory(
  bucket: DesignCategoryBucket,
): BlueprintUniversalCategory {
  switch (bucket) {
    case "closet":
      return "CLOSET";
    case "tv_wall":
      return "MIRRORS_TV";
    case "trim_millwork":
      return "TRIM_MOLDING";
    case "shelving_builtin":
      return "SHELVING";
    default:
      return "GENERIC";
  }
}

function inferShelfPattern(
  transcript: string | undefined,
): "stacked" | "staggered" | "wall_to_wall" {
  const t = (transcript ?? "").toLowerCase();
  if (/stagger|zigzag|alternating|offset\s+shelf/i.test(t)) return "staggered";
  if (/wall\s*to\s*wall|full[\s-]?wall|span\s*(the\s+)?wall|floor\s*to\s*ceiling\s*run/i.test(t)) {
    return "wall_to_wall";
  }
  return "stacked";
}

/**
 * Heuristic no-build zones on the elevation (normalized). Refines layout collision hints only.
 */
export function inferNoBuildZonesFromTranscript(text: string): BlueprintRect[] {
  const zones: BlueprintRect[] = [];
  const t = text.toLowerCase();
  if (/\boutlet\b/i.test(t)) {
    zones.push({ x: 0.06, y: 0.1, w: 0.08, h: 0.06, dashed: true });
  }
  if (/\boutlet\b.*\bright|right.*\boutlet\b/i.test(t)) {
    zones.push({ x: 0.86, y: 0.12, w: 0.08, h: 0.06, dashed: true });
  }
  if (/\bswitch\b/i.test(t)) {
    zones.push({ x: 0.88, y: 0.38, w: 0.05, h: 0.1, dashed: true });
  }
  return zones;
}

/**
 * Evenly spaced shelf levels from floor (inches), y = height * (i+1)/(n+1).
 */
export function generateShelvingBlueprint(
  dimensions: { widthIn: number; heightIn: number },
  count: number,
): { shelfYsInches: number[]; shelfYsNormalized: number[] } {
  const heightIn = dimensions.heightIn;
  if (
    !Number.isFinite(heightIn) ||
    heightIn <= 0 ||
    !Number.isFinite(count) ||
    count < 1
  ) {
    return { shelfYsInches: [], shelfYsNormalized: [] };
  }
  const n = Math.min(Math.floor(count), MAX_SHELVES);
  const shelfYsInches: number[] = [];
  for (let i = 0; i < n; i++) {
    shelfYsInches.push((heightIn * (i + 1)) / (n + 1));
  }
  const shelfYsNormalized = shelfYsInches.map((y) => y / heightIn);
  return { shelfYsInches, shelfYsNormalized };
}

function outerShell(): BlueprintLine[] {
  const x0 = 0.08;
  const x1 = 0.92;
  const y0 = 0.08;
  const y1 = 0.92;
  return [
    { x1: x0, y1: y0, x2: x1, y2: y0 },
    { x1: x1, y1: y0, x2: x1, y2: y1 },
    { x1: x1, y1: y1, x2: x0, y2: y1 },
    { x1: x0, y1: y1, x2: x0, y2: y0 },
  ];
}

/** If a horizontal shelf at yNorm intersects a no-build zone, split into up to two segments. */
function clippedHorizontalSegments(
  yNorm: number,
  x0: number,
  x1: number,
  zones: BlueprintRect[],
): Array<{ x1: number; x2: number }> {
  let segments = [{ x1: x0, x2: x1 }];
  for (const z of zones) {
    if (yNorm < z.y || yNorm > z.y + z.h) continue;
    const next: Array<{ x1: number; x2: number }> = [];
    for (const s of segments) {
      const zx0 = z.x;
      const zx1 = z.x + z.w;
      if (zx1 <= s.x1 || zx0 >= s.x2) {
        next.push(s);
        continue;
      }
      if (zx0 > s.x1) next.push({ x1: s.x1, x2: Math.min(zx0, s.x2) });
      if (zx1 < s.x2) next.push({ x1: Math.max(zx1, s.x1), x2: s.x2 });
    }
    segments = next.filter((s) => s.x2 - s.x1 > 0.02);
  }
  return segments;
}

function shelvingGeometry(
  specs: UniversalBlueprintSpecs,
  zones: BlueprintRect[],
  notes: string[],
): Pick<BlueprintPlan, "lines" | "rects"> {
  const pattern = specs.shelfPattern ?? inferShelfPattern(specs.transcriptHint);
  let count = specs.shelfCount ?? 0;
  if (count < 1) {
    count = 3;
    notes.push("shelfCount missing — defaulting to 3 shelves for blueprint");
  }
  count = Math.min(count, MAX_SHELVES);
  const { shelfYsNormalized } = generateShelvingBlueprint(
    { widthIn: specs.widthIn, heightIn: specs.heightIn },
    count,
  );

  const lines: BlueprintLine[] = [...outerShell()];
  const rects: BlueprintRect[] = [];

  const xL = 0.08;
  const xR = 0.92;
  for (let i = 0; i < shelfYsNormalized.length; i++) {
    const yn = shelfYsNormalized[i] ?? 0;
    let x0 = xL;
    let x1 = xR;
    if (pattern === "staggered") {
      if (i % 2 === 0) {
        x0 = xL;
        x1 = 0.55;
      } else {
        x0 = 0.45;
        x1 = xR;
      }
    } else if (pattern === "wall_to_wall") {
      x0 = 0.05;
      x1 = 0.95;
    }

    const segs = clippedHorizontalSegments(yn, x0, x1, zones);
    for (const s of segs) {
      lines.push({ x1: s.x1, y1: yn, x2: s.x2, y2: yn });
    }
  }
  notes.push(`SHELVING pattern=${pattern}, shelves=${count}`);
  return { lines, rects };
}

function closetGeometry(
  specs: UniversalBlueprintSpecs,
  notes: string[],
): Pick<BlueprintPlan, "lines" | "rects"> {
  const lines: BlueprintLine[] = [...outerShell()];
  const rects: BlueprintRect[] = [];

  // Vertical gables (towers)
  lines.push({ x1: 0.18, y1: 0.08, x2: 0.18, y2: 0.92 });
  lines.push({ x1: 0.82, y1: 0.08, x2: 0.82, y2: 0.92 });

  const rods = Math.max(1, Math.min(specs.closetRodCount ?? 2, 4));
  const rodYs =
    rods === 1
      ? [0.62]
      : rods === 2
        ? [0.52, 0.72]
        : rods === 3
          ? [0.45, 0.62, 0.78]
          : [0.4, 0.55, 0.7, 0.82];
  for (const yn of rodYs.slice(0, rods)) {
    lines.push({ x1: 0.2, y1: yn, x2: 0.8, y2: yn });
  }

  const drawerRaw = specs.drawerCount;
  const drawers =
    drawerRaw === null || drawerRaw === undefined
      ? 2
      : Math.min(Math.max(drawerRaw, 0), 8);
  if (drawers > 0) {
    const stackW = 0.62 / drawers;
    for (let d = 0; d < drawers; d++) {
      rects.push({
        x: 0.19 + d * stackW,
        y: 0.08,
        w: stackW * 0.92,
        h: 0.14,
      });
    }
  }
  notes.push(`CLOSET rods=${rods}, drawers=${drawers}`);
  return { lines, rects };
}

function trimGeometry(notes: string[]): Pick<BlueprintPlan, "lines" | "rects"> {
  const lines: BlueprintLine[] = [...outerShell()];
  // Crown (near ceiling)
  lines.push({ x1: 0.08, y1: 0.9, x2: 0.92, y2: 0.9 });
  lines.push({ x1: 0.08, y1: 0.93, x2: 0.92, y2: 0.93 });
  // Base
  lines.push({ x1: 0.08, y1: 0.1, x2: 0.92, y2: 0.1 });
  lines.push({ x1: 0.08, y1: 0.07, x2: 0.92, y2: 0.07 });
  // Wainscot grid
  for (let i = 1; i <= 5; i++) {
    const x = 0.1 + i * 0.14;
    lines.push({ x1: x, y1: 0.08, x2: x, y2: 0.42 });
  }
  lines.push({ x1: 0.08, y1: 0.36, x2: 0.92, y2: 0.36 });
  lines.push({ x1: 0.08, y1: 0.42, x2: 0.92, y2: 0.42 });
  notes.push("TRIM_MOLDING crown + base + wainscot grid");
  return { lines, rects: [] };
}

function mirrorTvGeometry(notes: string[]): Pick<BlueprintPlan, "lines" | "rects"> {
  const lines: BlueprintLine[] = [...outerShell()];
  const rects: BlueprintRect[] = [];
  const rw = 0.55;
  const rh = 0.38;
  const cx = 0.5;
  const bottomY = 0.38;
  rects.push({
    x: cx - rw / 2,
    y: bottomY,
    w: rw,
    h: rh,
  });
  notes.push("MIRRORS_TV centered module");
  return { lines, rects };
}

/**
 * Builds a coordinate blueprint plan for downstream rasterization (1024² PNG: `blueprintPlanToSvgString` + sharp).
 */
export function generateUniversalBlueprint(
  category: BlueprintUniversalCategory,
  specs: UniversalBlueprintSpecs,
): BlueprintPlan {
  const notes: string[] = [];
  const zones = inferNoBuildZonesFromTranscript(specs.transcriptHint ?? "");

  let lines: BlueprintLine[] = [];
  let rects: BlueprintRect[] = [];

  // Geometry branches: shelving built-ins, closets, trim/millwork (TRIM), plus TV/mirror wall and generic fallback.
  switch (category) {
    case "SHELVING": {
      const g = shelvingGeometry(specs, zones, notes);
      lines = g.lines;
      rects = g.rects;
      break;
    }
    case "CLOSET": {
      const g = closetGeometry(specs, notes);
      lines = g.lines;
      rects = g.rects;
      break;
    }
    case "TRIM_MOLDING": {
      const g = trimGeometry(notes);
      lines = g.lines;
      rects = g.rects;
      break;
    }
    case "MIRRORS_TV": {
      const g = mirrorTvGeometry(notes);
      lines = g.lines;
      rects = g.rects;
      break;
    }
    default: {
      lines = outerShell();
      notes.push("GENERIC envelope only");
    }
  }

  return {
    category,
    lines,
    rects,
    noBuildZones: zones.map((z) => ({ ...z, dashed: true })),
    meta: {
      widthIn: specs.widthIn,
      heightIn: specs.heightIn,
      depthIn: specs.depthIn ?? null,
      notes,
    },
  };
}

const BLUEPRINT_SVG_SIZE = 1024;
const BLUEPRINT_SVG_MARGIN = 64;

/**
 * Single-page SVG (1024×1024): black background, **white** line geometry — rasterize with sharp in the API route.
 */
export function blueprintPlanToSvgString(plan: BlueprintPlan): string {
  const CANVAS = BLUEPRINT_SVG_SIZE;
  const MARGIN = BLUEPRINT_SVG_MARGIN;
  const inner = CANVAS - 2 * MARGIN;
  const aspect = plan.meta.heightIn / plan.meta.widthIn;
  let iw = inner;
  let ih = Math.round(inner * aspect);
  if (ih > inner) {
    ih = inner;
    iw = Math.round(inner / aspect);
  }
  const ox = MARGIN + (inner - iw) / 2;
  const oy = MARGIN + (inner - ih) / 2;

  const toX = (nx: number) => ox + nx * iw;
  const toY = (nyFromFloor: number) => oy + ih - nyFromFloor * ih;

  const parts: string[] = [
    `<rect width="${CANVAS}" height="${CANVAS}" fill="#000000"/>`,
  ];

  for (const L of plan.lines) {
    parts.push(
      `<line x1="${toX(L.x1)}" y1="${toY(L.y1)}" x2="${toX(L.x2)}" y2="${toY(L.y2)}" stroke="#ffffff" stroke-width="4" stroke-linecap="square"/>`,
    );
  }

  for (const r of plan.rects) {
    const x = toX(r.x);
    const y = toY(r.y + r.h);
    const w = r.w * iw;
    const h = r.h * ih;
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#ffffff" stroke-width="3"/>`,
    );
  }

  for (const r of plan.noBuildZones) {
    const x = toX(r.x);
    const y = toY(r.y + r.h);
    const w = r.w * iw;
    const h = r.h * ih;
    const dash = r.dashed ? ` stroke-dasharray="10 8"` : "";
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#ffffff" stroke-width="2"${dash}/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">${parts.join("")}</svg>`;
}
