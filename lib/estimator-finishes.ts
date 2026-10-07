/**
 * Finish classification for the estimator's finishing process model.
 *
 * Different finishes mean fundamentally different shop processes — white oak
 * gets stained + clear-coated (never primed/painted), paint-grade gets
 * prime + topcoats, prefinished sheet gets no finishing labor at all.
 * This module normalizes free-text finish descriptions into a finish family
 * so the estimator can plan the right process, materials, and dry times.
 *
 * INTERNAL — planning only. Nothing here is customer-facing.
 */

export type FinishFamily =
  | "painted"
  | "stained"
  | "clear-coat"
  | "oil"
  | "prefinished";

/**
 * Human-readable process names per family.
 */
export const FINISH_FAMILY_LABELS: Record<FinishFamily, string> = {
  painted: "Painted (prime + topcoats)",
  stained: "Stained hardwood + clear topcoat",
  "clear-coat": "Clear coat, no stain (sealer + topcoat)",
  oil: "Hardwax oil finish (no spray)",
  prefinished: "Pre-finished — no shop finishing",
};

export type FinishStep = {
  /** Stable key, e.g. "prime", "stain", "dry-after-stain". */
  key: string;
  /** Labor line description. */
  label: string;
  /** Target hours per shelf/unit. */
  hoursPerUnit: number;
  /** Paid wait hours per wall batch (finisher on the clock). */
  hoursPerWall: number;
  /**
   * Unpaid calendar hold in days (parts sit drying/curing while the
   * finisher does other work — it pushes the schedule, not the payroll).
   * E.g. oil stain needs an overnight dry before sealer.
   */
  calendarDays?: number;
  /** Extra detail for the math trace. */
  detail: string;
};

export type FinishProcess = {
  /** Ordered shop steps for this finish family. */
  steps: FinishStep[];
  /** Material keys (into PRICE_BOOK.materials) consumed by this process. */
  materialKeys: string[];
  /** Process notes for the math trace. */
  notes: string;
};

/**
 * Normalize a free-text finish (from the planner conversation, proposal, or
 * site notes) into a finish family. Tom's house standard: white oak and
 * other hardwoods default to stained, not painted.
 */
export function classifyFinish(finish: string | null | undefined): {
  family: FinishFamily;
  /** True when the input named no finish and we fell back to the default. */
  assumed: boolean;
  /** The normalized basis for the decision, for the math trace. */
  basis: string;
} {
  const raw = (finish || "").trim();
  const f = raw.toLowerCase();

  const match = (family: FinishFamily, basis: string) => ({
    family,
    assumed: false,
    basis,
  });

  if (/\bmelamine\b|\bpre-?finished\b|\blaminate\b|\btfl\b/.test(f))
    return match("prefinished", `"${raw}" → prefinished (no shop finishing)`);
  if (/\bhardwax\b|\brubio\b|\bosmo\b|\boil finish\b|\boiled\b/.test(f))
    return match("oil", `"${raw}" → hardwax oil finish`);
  if (/\bpaint\b|\bpainted\b|\blacquered\b.*\bcolor\b|\bmdf\b.*\bpaint/i.test(f))
    return match("painted", `"${raw}" → painted`);
  // "lacquer" alone usually means clear topcoat in Tom's context; colored
  // lacquer is caught by the painted branch above.
  if (/\bclear\b|\bvarnish\b|\bpolyurethane\b|\blacquer\b|\bnatural\b/.test(f))
    return match("clear-coat", `"${raw}" → clear coat (no stain)`);
  if (/\bstain\b|\bstained\b/.test(f))
    return match("stained", `"${raw}" → stained hardwood`);
  // Named hardwoods → stained (house standard is white oak, stained).
  if (/\boak\b|\bwalnut\b|\bmaple\b|\bcherry\b|\bash\b|\bhickory\b/.test(f))
    return match("stained", `"${raw}" names a hardwood → stained (house standard)`);
  if (/\bwhite\b(?!\s*oak)/.test(f) && /\bpaint/i.test(raw))
    return match("painted", `"${raw}" → painted`);

  // Default: painted (paint-grade) — flagged as assumed, never silent.
  return {
    family: "painted",
    assumed: true,
    basis: raw
      ? `"${raw}" unrecognized → assumed painted (paint-grade); confirm finish`
      : "no finish specified → assumed painted (paint-grade); confirm finish",
  };
}

/**
 * Shop finishing processes per finish family. All hours are VERIFY
 * placeholders (Tom's starting targets) — the SEQUENCES reflect real
 * cabinet-shop practice (see research notes per family).
 *
 * Key process differences:
 * - painted: assemble → knock down → prime → topcoat ×2 → reassemble.
 * - stained: parts are sanded/stained/sealed flat BEFORE assembly (stain
 *   pools unevenly in joints); no knock-down cycle, no primer.
 * - clear-coat: like stained minus the stain step.
 * - oil: wipe-on/wipe-off hardwax oil, no spray booth, no knock-down.
 * - prefinished: no finishing labor or materials at all.
 */
export const FINISH_PROCESSES: Record<FinishFamily, FinishProcess> = {
  painted: {
    steps: [
      { key: "knockdown", label: "Knock-down for finishing + reassembly (shop)", hoursPerUnit: 0.25, hoursPerWall: 0, detail: "assembled carcass broken into paintable parts, reassembled after final coat" },
      { key: "prime", label: "Prime coat (shop)", hoursPerUnit: 0.25, hoursPerWall: 0, detail: "one prime coat, all faces" },
      { key: "dry-prime", label: "Dry/wait after prime — PAID (shop)", hoursPerUnit: 0, hoursPerWall: 0.5, detail: "all parts dry together; finisher on the clock unless on other billable work" },
      { key: "topcoat", label: "Topcoats ×2 + sand between (shop)", hoursPerUnit: 0.5, hoursPerWall: 0, detail: "two finish coats with scuff-sand between" },
      { key: "dry-topcoat", label: "Dry/wait after final coat — PAID (shop)", hoursPerUnit: 0, hoursPerWall: 0.5, detail: "dry before handling/reassembly" },
    ],
    materialKeys: ["primerGal", "paintGal"],
    notes: "Assemble → knock down → prime → 2 topcoats → reassemble.",
  },
  stained: {
    steps: [
      { key: "sand", label: "Sand 120→150→180, all faces (shop)", hoursPerUnit: 0.3, hoursPerWall: 0, detail: "no finer than 220 before finishing — over-sanding weakens stain/topcoat grip" },
      { key: "stain", label: "Stain application + wipe (shop)", hoursPerUnit: 0.25, hoursPerWall: 0, detail: "oil-based wiping stain on flat parts; glue joints masked" },
      { key: "dry-stain", label: "Overnight stain dry — CALENDAR HOLD (shop)", hoursPerUnit: 0, hoursPerWall: 0, calendarDays: 1, detail: "6–12 hrs before sealer (up to 72 in damp/cold); topcoating wet stain causes adhesion failure — usually unpaid, pushes schedule a day" },
      { key: "sealer", label: "Sanding sealer + scuff sand (shop)", hoursPerUnit: 0.25, hoursPerWall: 0, detail: "one sealer coat; 30–60 min dry, sand 320" },
      { key: "topcoat", label: "Clear topcoats ×2 (shop)", hoursPerUnit: 0.4, hoursPerWall: 0, detail: "pre-cat lacquer typical small-shop topcoat (ventilation + respirator); conversion varnish = booth recommended" },
      { key: "dry-topcoat", label: "Dry to stack — PAID (shop)", hoursPerUnit: 0, hoursPerWall: 0.5, detail: "~3 hrs to stack (pre-cat); 24 hrs to pack for conversion varnish" },
    ],
    materialKeys: ["stainQt", "sealerGal", "topcoatGal"],
    notes: "Parts finished FLAT before assembly — no knock-down, no primer. Oak doesn't blotch (no conditioner needed). Water-based topcoat on white oak risks tannin pull — shellac washcoat first.",
  },
  "clear-coat": {
    steps: [
      { key: "sand", label: "Sand 120→150→180, all faces (shop)", hoursPerUnit: 0.3, hoursPerWall: 0, detail: "no stain step" },
      { key: "sealer", label: "Sanding sealer + scuff sand (shop)", hoursPerUnit: 0.25, hoursPerWall: 0, detail: "one sealer coat; 30–60 min dry, sand 320" },
      { key: "topcoat", label: "Clear topcoats ×2 (shop)", hoursPerUnit: 0.4, hoursPerWall: 0, detail: "pre-cat lacquer typical; conversion varnish = booth recommended" },
      { key: "dry-topcoat", label: "Dry to stack — PAID (shop)", hoursPerUnit: 0, hoursPerWall: 0.5, detail: "~3 hrs to stack (pre-cat)" },
    ],
    materialKeys: ["sealerGal", "topcoatGal"],
    notes: "Stained sequence minus the stain step and overnight hold. Parts finished flat before assembly.",
  },
  oil: {
    steps: [
      { key: "sand", label: "Sand to 120–150, all faces (shop)", hoursPerUnit: 0.3, hoursPerWall: 0, detail: "oils need open grain — sanding finer reduces absorption" },
      { key: "oil-coat", label: "Hardwax oil — apply, buff, wipe excess (shop)", hoursPerUnit: 0.35, hoursPerWall: 0, detail: "one coat (Rubio-style); wipe ALL excess within ~15 min; no spray booth, 0% VOC" },
      { key: "cure-use", label: "Cure before use — CALENDAR HOLD (shop)", hoursPerUnit: 0, hoursPerWall: 0, calendarDays: 2, detail: "24–36 hrs before use; 5-day full cure; no water contact during cure" },
    ],
    materialKeys: ["hardwaxOilL"],
    notes: "One-man-shop friendly: no spray equipment. Least labor, longest cure. Less scratch/chemical resistance than varnish — best for shelving/closets, not wet areas.",
  },
  prefinished: {
    steps: [],
    materialKeys: [],
    notes: "No shop finishing — parts arrive finished (melamine/pre-finished ply). Assembly + install only.",
  },
};
