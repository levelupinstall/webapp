/**
 * Parametric millwork model: the single structured description of a piece
 * of millwork that ALL shop-drawing views (front elevation, side, plan,
 * isometric) render from, so the views can never disagree with each other.
 *
 * Built from the vision-grounded zones on the PlannerVisualSpec (sections
 * read off the concept image: shelf/rod heights, counter height, door and
 * drawer front counts). Every measurement is in inches, heights A.F.F.
 * (above finished floor). Elements the reads could not ground are marked
 * assumed rather than silently invented.
 */

import type { MillworkZone, PlannerVisualSpec } from "./planner-visual-spec.js";

export type ModelFront = {
  kind: "door" | "drawer";
  x0In: number;
  x1In: number;
  y0In: number; // bottom A.F.F.
  y1In: number; // top A.F.F.
};

export type ModelBaseRun = {
  x0In: number;
  x1In: number;
  heightIn: number;
  fronts: ModelFront[];
  assumed: boolean;
};

export type ModelSection = {
  x0In: number;
  x1In: number;
  /** Top of this section's case, A.F.F. */
  topIn: number;
  /** False for floating shelves (no case, no gables). */
  cased: boolean;
  /** Shelf board heights A.F.F., ascending. */
  shelvesIn: number[];
  /** Rod heights A.F.F., descending (top rod first). */
  rodsIn: number[];
  /** Drawer stack at the section's bottom (closet towers). */
  drawers: { count: number; eachIn: number } | null;
  assumed: boolean;
};

export type ModelGable = {
  xIn: number;
  topIn: number;
  bottomIn: number;
};

export type MillworkModel = {
  wallWIn: number;
  wallHIn: number;
  unitX0In: number;
  unitX1In: number;
  unitTopIn: number;
  /** Case (upper) depth. */
  depthIn: number;
  baseRuns: ModelBaseRun[];
  sections: ModelSection[];
  shoeBand: { x0In: number; x1In: number; rows: number; heightIn: number } | null;
  gables: ModelGable[];
  /** True when any element fell back to an assumed value. */
  assumed: boolean;
};

export function resolveWallDims(spec: PlannerVisualSpec): { wallWIn: number; wallHIn: number } {
  const wallWIn = spec.width ?? 96;
  const rawHeight = spec.height;
  const wallHIn = rawHeight !== null && rawHeight >= 84 ? rawHeight : 96;
  return { wallWIn, wallHIn };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Lay out base-cabinet fronts from counted doors/drawers. Convention:
 * drawers over doors when both exist (a drawer row on top, doors below);
 * doors only → equal door fronts; drawers only → equal stacked fronts. */
function layoutFronts(
  x0In: number,
  x1In: number,
  heightIn: number,
  doors: number,
  drawers: number,
): ModelFront[] {
  const fronts: ModelFront[] = [];
  const w = x1In - x0In;
  if (doors > 0 && drawers > 0) {
    const drawerH = clamp(heightIn * 0.28, 5, 8);
    const dw = w / drawers;
    for (let i = 0; i < drawers; i++) {
      fronts.push({
        kind: "drawer",
        x0In: x0In + i * dw,
        x1In: x0In + (i + 1) * dw,
        y0In: heightIn - drawerH,
        y1In: heightIn,
      });
    }
    const doorW = w / doors;
    for (let i = 0; i < doors; i++) {
      fronts.push({
        kind: "door",
        x0In: x0In + i * doorW,
        x1In: x0In + (i + 1) * doorW,
        y0In: 0,
        y1In: heightIn - drawerH,
      });
    }
  } else if (doors > 0) {
    const doorW = w / doors;
    for (let i = 0; i < doors; i++) {
      fronts.push({ kind: "door", x0In: x0In + i * doorW, x1In: x0In + (i + 1) * doorW, y0In: 0, y1In: heightIn });
    }
  } else if (drawers > 0) {
    const dh = heightIn / drawers;
    for (let i = 0; i < drawers; i++) {
      fronts.push({ kind: "drawer", x0In, x1In, y0In: i * dh, y1In: (i + 1) * dh });
    }
  }
  return fronts;
}

/** Section top from a band's zones, preferring the vision-read topFrac. */
function bandTopIn(band: MillworkZone[], wallHIn: number): number {
  for (const z of band) {
    if (z.topFrac !== undefined) return clamp(z.topFrac * wallHIn, 24, wallHIn - 2);
  }
  let top = 0;
  for (const z of band) {
    if (z.kind === "hanging") {
      top = Math.max(
        top,
        z.rodYs && z.rodYs.length > 0
          ? Math.min(wallHIn - 4, Math.max(...z.rodYs) * wallHIn + 12)
          : 82,
      );
    } else if (z.kind === "shelf-tower" || z.kind === "open-shelves") {
      if (z.shelfYs && z.shelfYs.length > 0) {
        const ys = [...z.shelfYs].sort((a, b) => a - b).map((f) => f * wallHIn);
        const spacing = ys.length > 1 ? ys[ys.length - 1] - ys[ys.length - 2] : 10;
        top = Math.max(top, Math.min(wallHIn - 4, ys[ys.length - 1] + spacing + 2));
      } else {
        top = Math.max(top, 84);
      }
    } else if (z.kind === "drawers") {
      top = Math.max(top, Math.min(6, Math.round(z.drawers ?? 3)) * 9 + 6);
    } else if (z.kind === "built-in-bays") {
      top = Math.max(top, wallHIn - 8);
    }
  }
  return top > 0 ? top : Math.min(84, wallHIn - 4);
}

/**
 * Build the parametric model from a spec whose zones have been finalized.
 * Returns null when there are no zones to model (legacy shelf path).
 */
export function buildMillworkModel(
  spec: PlannerVisualSpec,
  wallWIn: number,
  wallHIn: number,
): MillworkModel | null {
  const zones = spec.zones;
  if (!zones || zones.length === 0) return null;
  const X = (f: number) => f * wallWIn;
  let assumed = false;

  // ---- Shoe band ----
  const shoeZone = zones.find((z) => z.kind === "shoe-cubbies");
  const shoeBand = shoeZone
    ? { x0In: X(shoeZone.x0), x1In: X(shoeZone.x1), rows: shoeZone.rows ?? 2, heightIn: 22 }
    : null;
  const floorBaseIn = shoeBand ? shoeBand.heightIn : 0;

  // ---- Base runs ----
  const baseRuns: ModelBaseRun[] = [];
  for (const z of zones) {
    if (z.kind === "base-cabinets") {
      const grounded = z.counterTopFrac !== undefined;
      const heightIn = grounded
        ? clamp(z.counterTopFrac! * wallHIn, 18, 48)
        : 30; // standard sideboard height when the read missed the counter
      if (!grounded || z.assumed) assumed = true;
      const doors = z.baseDoors ?? 0;
      const drawers = z.baseDrawers ?? 0;
      const fronts =
        doors + drawers > 0
          ? layoutFronts(X(z.x0), X(z.x1), heightIn, doors, drawers)
          : layoutFronts(X(z.x0), X(z.x1), heightIn, 4, 0); // legacy assumption
      if (doors + drawers === 0) assumed = true;
      baseRuns.push({ x0In: X(z.x0), x1In: X(z.x1), heightIn, fronts, assumed: !grounded || doors + drawers === 0 });
    }
  }

  // ---- Sections: group non-base, non-shoe zones into x-bands ----
  type Band = { x0: number; x1: number; zones: MillworkZone[] };
  const bands: Band[] = [];
  const bandFor = (x0: number, x1: number): Band => {
    const key = (v: number) => Math.round(v * 1000);
    let b = bands.find((bb) => key(bb.x0) === key(x0) && key(bb.x1) === key(x1));
    if (!b) {
      b = { x0, x1, zones: [] };
      bands.push(b);
    }
    return b;
  };
  for (const z of zones) {
    if (z.kind === "shoe-cubbies" || z.kind === "base-cabinets") continue;
    if (z.kind === "built-in-bays" && z.bays) {
      for (const bay of z.bays) {
        const bx0 = z.x0 + bay.x0 * (z.x1 - z.x0);
        const bx1 = z.x0 + bay.x1 * (z.x1 - z.x0);
        const synth: MillworkZone = {
          kind: "open-shelves",
          x0: bx0,
          x1: bx1,
          shelves: bay.shelves,
          assumed: z.assumed,
        };
        bandFor(bx0, bx1).zones.push(synth);
        if (bay.baseCabinet && (bay.baseCabinet.doors > 0 || bay.baseCabinet.drawers > 0)) {
          baseRuns.push({
            x0In: X(bx0),
            x1In: X(bx1),
            heightIn: 30,
            fronts: layoutFronts(X(bx0), X(bx1), 30, bay.baseCabinet.doors, bay.baseCabinet.drawers),
            assumed: !!z.assumed,
          });
        }
      }
      continue;
    }
    bandFor(z.x0, z.x1).zones.push(z);
  }
  bands.sort((a, b) => a.x0 - b.x0);

  const sections: ModelSection[] = bands.map((band) => {
    const zs = band.zones;
    const topIn = bandTopIn(zs, wallHIn);
    const cased = !zs.every((z) => z.kind === "floating-shelves");
    // Bottom of the section's open area: a base run COVERING this band
    // raises it (hutch uppers sit on the sideboard, wherever their band
    // falls inside the base's span).
    const baseUnder = baseRuns
      .filter((r) => r.x0In <= X(band.x0) + 1 && r.x1In >= X(band.x1) - 1)
      .sort((a, b) => b.heightIn - a.heightIn)[0];
    const areaBottomIn = baseUnder ? baseUnder.heightIn : floorBaseIn;

    let drawers: ModelSection["drawers"] = null;
    const drawerZone = zs.find((z) => z.kind === "drawers");
    if (drawerZone) {
      drawers = { count: clamp(Math.round(drawerZone.drawers ?? 3), 1, 6), eachIn: 9.5 };
    }
    const drawerStackTopIn = drawers ? floorBaseIn + drawers.count * drawers.eachIn : areaBottomIn;
    const shelfBottomIn = Math.max(areaBottomIn, drawerStackTopIn);

    const shelvesIn: number[] = [];
    for (const z of zs) {
      if (z.kind !== "open-shelves" && z.kind !== "shelf-tower" && z.kind !== "floating-shelves") continue;
      const n = clamp(Math.round(z.shelves ?? 0), 0, 10);
      if (n === 0) continue;
      if (z.shelfYs && z.shelfYs.length > 0) {
        const ys = [...z.shelfYs].sort((a, b) => a - b).map((f) => f * wallHIn);
        for (let i = 0; i < n; i++) {
          const y = ys[i] !== undefined ? ys[i] : shelfBottomIn + ((i + 1) * (topIn - shelfBottomIn)) / (n + 1);
          if (y > shelfBottomIn + 2 && y < topIn - 1) shelvesIn.push(y);
        }
      } else {
        // Evenly spaced between the area bottom and the case top.
        for (let i = 0; i < n; i++) {
          const y =
            n === 1
              ? (shelfBottomIn + topIn) / 2
              : shelfBottomIn + 4 + (i * (topIn - 6 - (shelfBottomIn + 4))) / Math.max(1, n - 1);
          if (y > shelfBottomIn + 2 && y < topIn - 1) shelvesIn.push(y);
        }
      }
    }
    shelvesIn.sort((a, b) => a - b);

    const rodsIn: number[] = [];
    for (const z of zs) {
      if (z.kind !== "hanging") continue;
      const nR = clamp(Math.round(z.rods ?? 0), 0, 3);
      if (nR === 0) continue;
      if (z.rodYs && z.rodYs.length > 0) {
        rodsIn.push(...[...z.rodYs].sort((a, b) => b - a).slice(0, nR).map((f) => f * wallHIn));
      } else {
        rodsIn.push(...(nR === 1 ? [66] : nR === 2 ? [64, 32] : [80, 52, 30]));
      }
    }
    rodsIn.sort((a, b) => b - a);

    if (zs.some((z) => z.assumed)) assumed = true;
    return {
      x0In: X(band.x0),
      x1In: X(band.x1),
      topIn,
      cased,
      shelvesIn,
      rodsIn,
      drawers,
      assumed: zs.some((z) => !!z.assumed),
    };
  });

  // Empty sections (a TV opening or blank bay the read segmented but
  // found nothing in) are NOT casework: no gables, no case top, and they
  // must not lift the unit's overall top.
  for (const s of sections) {
    const hasContent = s.shelvesIn.length > 0 || s.rodsIn.length > 0 || s.drawers !== null;
    if (!hasContent) s.cased = false;
  }
  const contentTops = sections
    .filter((s) => s.shelvesIn.length > 0 || s.rodsIn.length > 0 || s.drawers !== null)
    .map((s) => s.topIn);
  for (const s of sections) {
    const hasContent = s.shelvesIn.length > 0 || s.rodsIn.length > 0 || s.drawers !== null;
    if (!hasContent && contentTops.length > 0) s.topIn = Math.max(...contentTops);
  }

  // ---- Gables: boundaries of cased sections, tops clustered per unit ----
  const boundaryTop = new Map<number, number>();
  for (const s of sections) {
    if (!s.cased) continue;
    for (const bx of [s.x0In, s.x1In]) {
      boundaryTop.set(bx, Math.max(boundaryTop.get(bx) ?? 0, s.topIn));
    }
  }
  const topsSorted = [...new Set(boundaryTop.values())].sort((a, b) => a - b);
  const clusterMax = new Map<number, number>();
  let group: number[] = [];
  const flush = () => {
    if (group.length) {
      const m = Math.max(...group);
      for (const t of group) clusterMax.set(t, m);
      group = [];
    }
  };
  for (const t of topsSorted) {
    if (group.length && t - group[group.length - 1] > 12) flush();
    group.push(t);
  }
  flush();
  const gables: ModelGable[] = [...boundaryTop.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([xIn, t]) => {
      const topIn = clusterMax.get(t) ?? t;
      const baseUnder = baseRuns
        .filter((r) => xIn >= r.x0In - 1 && xIn <= r.x1In + 1)
        .sort((a, b) => b.heightIn - a.heightIn)[0];
      return { xIn, topIn, bottomIn: baseUnder ? baseUnder.heightIn : floorBaseIn };
    });

  const allX = [
    ...sections.flatMap((s) => [s.x0In, s.x1In]),
    ...baseRuns.flatMap((r) => [r.x0In, r.x1In]),
  ];
  const unitX0In = allX.length ? Math.min(...allX) : 0;
  const unitX1In = allX.length ? Math.max(...allX) : wallWIn;
  const unitTopIn = contentTops.length ? Math.max(...contentTops) : 84;

  return {
    wallWIn,
    wallHIn,
    unitX0In,
    unitX1In,
    unitTopIn,
    depthIn: spec.depth ?? 16,
    baseRuns,
    sections,
    shoeBand,
    gables,
    assumed,
  };
}
