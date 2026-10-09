/**
 * 3D room scan integration for the planner.
 *
 * The customer films a walkthrough of their room with Polycam (free tier,
 * Android + iPhone) and uploads the exported floor plan. Vision extracts
 * the real wall dimensions, replacing the assumed `*` values in the spec.
 *
 * This is the "no unpaid site measure" unlock: real measurements from the
 * customer's phone, before Tom ever visits.
 */

export type RoomScanDimensions = {
  /** Wall lengths in inches, in floor-plan order. */
  wallLengthsIn: number[];
  /** Ceiling height in inches. */
  ceilingHeightIn: number | null;
  /** Door/window openings: wall index, position along wall (inches from left), width (inches). */
  openings: { wallIndex: number; positionIn: number; widthIn: number; kind: "door" | "window" }[];
  /** True when every dimension came from the scan (none assumed). */
  allMeasured: boolean;
};

/**
 * Prompt for the vision model to extract dimensions from a Polycam
 * floor plan export image.
 */
export function buildScanDimensionPrompt(): string {
  return (
    "You are looking at a floor plan exported from a 3D room scan (Polycam or similar). " +
    "Extract the room's dimensions as JSON. " +
    "Reply with exactly one JSON object and nothing else, using this schema: " +
    '{"wallLengthsIn":[120,96],"ceilingHeightIn":96,"openings":[{"wallIndex":0,"positionIn":24,"widthIn":32,"kind":"door"}]}. ' +
    "Rules: wallLengthsIn are the wall lengths in inches, in clockwise order starting from the top wall; " +
    "ceilingHeightIn is the ceiling height in inches (null if not shown); " +
    "openings lists doors and windows with the wall index, distance from the wall's left end in inches, and width in inches. " +
    "If a dimension is not legible, omit it rather than guessing. " +
    "If this is not a floor plan, return {\"wallLengthsIn\":[],\"ceilingHeightIn\":null,\"openings\":[]}."
  );
}

/**
 * Validate and normalize vision-extracted scan dimensions.
 * Returns null when the extraction is unusable (caller falls back to assumed dims).
 */
export function normalizeScanDimensions(raw: unknown): RoomScanDimensions | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const walls = Array.isArray(r.wallLengthsIn)
    ? (r.wallLengthsIn as unknown[])
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v >= 24 && v <= 600)
    : [];
  if (walls.length === 0) return null;
  const ceil = Number(r.ceilingHeightIn);
  const openings = Array.isArray(r.openings)
    ? (r.openings as Record<string, unknown>[])
        .map((o) => ({
          wallIndex: Math.max(0, Math.floor(Number(o.wallIndex) || 0)),
          positionIn: Math.max(0, Number(o.positionIn) || 0),
          widthIn: Math.max(0, Number(o.widthIn) || 0),
          kind: o.kind === "window" ? ("window" as const) : ("door" as const),
        }))
        .filter((o) => o.widthIn > 0 && o.wallIndex < walls.length)
    : [];
  return {
    wallLengthsIn: walls,
    ceilingHeightIn: Number.isFinite(ceil) && ceil >= 72 && ceil <= 144 ? ceil : null,
    openings,
    allMeasured: true,
  };
}
