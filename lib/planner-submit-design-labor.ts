import type { PlannerLaborComputation, PlannerSubmitDesignExtract } from "@/lib/planner-submit-design-types";

const CARPENTRY_MARGIN = 1.15;
const FLOOR_ACCESS_BUFFER_H = 1;
const CONDO_BUFFER_H = 1;
const INCLUDED_LABOR_H = 2;
const LABOR_HOLD_RATE_CAD = 75;
export const CALL_OUT_FEE_CAD = 150;

/** Fallback complexity score when Gemini omits base labor hours. */
export function heuristicBaseLaborHours(transcript: string): number {
  const t = transcript.toLowerCase();
  let h = 2;
  if (/\bwalk[\s-]?in\b|\bfloor[\s-]?to[\s-]?ceiling\b|\b builtins\b|\bbuilt[\s-]?ins?\b|\bwall\s+unit\b/i.test(t)) {
    h += 3;
  }
  if (/\bmolding|crown|wainscot|trim\s+package\b/i.test(t)) h += 2;
  if (/\bshelv(?:es|ing)?\b|\bcabinet\b|\bpantry\b/i.test(t)) h += 1;
  if (/\bmudroom\b|\bbench\b|\bentry\b/i.test(t)) h += 1;
  return Math.min(28, Math.max(1.5, h));
}

/** Carpenter swap: if depth > height, swap (same rule as visual spec). */
export function applySubmitDimensionSwap(w: number, h: number, d: number): {
  width: number;
  height: number;
  depth: number;
} {
  let heightOut = h;
  let depthOut = d;
  if (heightOut > 0 && depthOut > 0 && depthOut > heightOut) {
    const tmp = heightOut;
    heightOut = depthOut;
    depthOut = tmp;
  }
  return { width: w, height: heightOut, depth: depthOut };
}

export function dwellingImpliesCondo(dwellingType: string): boolean {
  const t = dwellingType.trim().toLowerCase();
  if (!t) return false;
  return /\bcondo|condominium|apartment|apt\b|strata|loft|high[\s-]?rise|stacked|tower\b/i.test(t);
}

export function computePlannerLaborAndCharges(params: {
  extraction: PlannerSubmitDesignExtract;
  dims: { width: number; height: number; depth: number };
  materialCostCad: number;
}): PlannerLaborComputation {
  let base =
    params.extraction.baseLaborHoursEstimate !== null &&
    Number.isFinite(params.extraction.baseLaborHoursEstimate)
      ? Math.max(0.25, params.extraction.baseLaborHoursEstimate)
      : 2;

  const floorLevel =
    params.extraction.floorLevel !== null &&
    Number.isFinite(params.extraction.floorLevel)
      ? Math.round(params.extraction.floorLevel)
      : 1;

  const hasElevator =
    params.extraction.hasElevator === null ? true : params.extraction.hasElevator;

  const dwellingLabel =
    params.extraction.dwellingType?.trim() ||
    (params.extraction.hasElevator === false && floorLevel > 1 ? "multi-storey" : "residential");

  let floorAccessBufferHours = 0;
  if (floorLevel > 1 && !hasElevator) {
    floorAccessBufferHours = FLOOR_ACCESS_BUFFER_H;
  }

  let condoBufferHours = 0;
  if (dwellingImpliesCondo(dwellingLabel)) {
    condoBufferHours = CONDO_BUFFER_H;
  }

  const hoursBeforeMargin = base + floorAccessBufferHours + condoBufferHours;
  const estimatedTotalHours = hoursBeforeMargin * CARPENTRY_MARGIN;

  const laborHoldHours = Math.max(0, estimatedTotalHours - INCLUDED_LABOR_H);
  const laborHoldCad = laborHoldHours > 0 ? laborHoldHours * LABOR_HOLD_RATE_CAD : 0;

  const materialCostCad = Math.max(0, params.materialCostCad);
  const immediateChargeCad = CALL_OUT_FEE_CAD + materialCostCad;

  return {
    baseLaborHours: base,
    floorAccessBufferHours,
    condoBufferHours,
    hoursBeforeMargin,
    carpentryMarginMultiplier: CARPENTRY_MARGIN,
    estimatedTotalHours,
    laborHoldHours,
    laborHoldCad,
    immediateChargeCad,
    materialCostCad,
  };
}
