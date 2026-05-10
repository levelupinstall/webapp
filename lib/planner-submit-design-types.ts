/** Gemini extraction payload for planner → structured Job submit (no pricing strings). */
export type PlannerSubmitDesignExtract = {
  width: number | null;
  height: number | null;
  depth: number | null;
  material: string | null;
  style: string | null;
  /** Phase 1 category — TV wall, shelving, trim, etc. */
  designCategory: string | null;
  /** Phase 1–3 narrative: use case, obstructions, removals (no pricing). */
  scopeNotes: string | null;
  floorLevel: number | null;
  dwellingType: string | null;
  hasElevator: boolean | null;
  /** Base install complexity in labor-hours before logistics buffers (not yet ×1.15). */
  baseLaborHoursEstimate: number | null;
};

export type PlannerLaborComputation = {
  baseLaborHours: number;
  floorAccessBufferHours: number;
  condoBufferHours: number;
  hoursBeforeMargin: number;
  carpentryMarginMultiplier: number;
  estimatedTotalHours: number;
  laborHoldHours: number;
  laborHoldCad: number;
  immediateChargeCad: number;
  materialCostCad: number;
};
