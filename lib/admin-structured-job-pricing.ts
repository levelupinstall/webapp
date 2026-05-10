import { CALL_OUT_FEE_CAD } from "@/lib/planner-submit-design-labor";

const INCLUDED_LABOR_H = 2;
const LABOR_HOLD_RATE_CAD = 75;

export type AdminStructuredJobPricing = {
  materialCost: number;
  estimatedHours: number;
  totalLaborHold: number;
  immediateCharge: number;
  paymentAmountCents: number;
  laborHoldAmountCents: number;
};

/** Aligns Job pricing with admin-edited material total and estimated labor hours. */
export function recomputeStructuredJobPricing(params: {
  materialCostCad: number;
  estimatedTotalHours: number;
}): AdminStructuredJobPricing {
  const materialCost = Math.max(0, params.materialCostCad);
  const estimatedHours = Math.min(120, Math.max(0.25, params.estimatedTotalHours));
  const immediateCharge = CALL_OUT_FEE_CAD + materialCost;
  const laborHoldHours = Math.max(0, estimatedHours - INCLUDED_LABOR_H);
  const totalLaborHold =
    laborHoldHours > 0 ? Math.round(laborHoldHours * LABOR_HOLD_RATE_CAD * 100) / 100 : 0;

  return {
    materialCost,
    estimatedHours,
    totalLaborHold,
    immediateCharge,
    paymentAmountCents: Math.max(100, Math.round(immediateCharge * 100)),
    laborHoldAmountCents: Math.round(totalLaborHold * 100),
  };
}
