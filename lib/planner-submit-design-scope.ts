import type { PlannerLaborComputation } from "@/lib/planner-submit-design-types";

/** Billing acknowledgement appended to proposals / persisted on Job.scopeOfWorkTerms */
export function buildPlannerScopeOfWorkTermsMarkdown(params: {
  dimsSummary: string;
  materialStyleSummary: string;
  dwellingFloorSummary: string;
  labor: PlannerLaborComputation;
}): string {
  const imm = params.labor.immediateChargeCad.toFixed(2);
  const mat = params.labor.materialCostCad.toFixed(2);
  const hold =
    params.labor.laborHoldCad > 0 ? `$${params.labor.laborHoldCad.toFixed(2)} CAD` : "$0.00 CAD";

  return [
    "## Scope of Work — Billing Acknowledgement",
    "",
    "- **Immediate charges:** The **call-out fee** and **materials deposit** are billed immediately upon checkout authorization and are **non-refundable** once captured.",
    "- **Condominium / strata access:** The client is responsible for arranging elevator bookings, loading dock windows, move notices, and any strata-required access logistics.",
    "- **Labor authorization:** Estimated incremental labor beyond the included assessment window may be secured as a **manual capture card authorization** (hold). **Final labor capture occurs immediately upon completion** of the installation scope agreed here.",
    "",
    "### Design intake snapshot",
    `- Dimensions (nominal): ${params.dimsSummary}`,
    `- Finishes / style: ${params.materialStyleSummary}`,
    `- Site context: ${params.dwellingFloorSummary}`,
    "",
    "### Estimate snapshot (CAD, indicative)",
    `- Call-out & materials charged now: **$${imm}** (includes materials bundle ~$${mat})`,
    `- Estimated total labor hours (after buffers × safety margin): **${params.labor.estimatedTotalHours.toFixed(2)} h**`,
    `- Manual-capture labor hold placed at checkout (if applicable): **${hold}**`,
    "",
    "_Figures are planning estimates; final installed scope is confirmed on site._",
  ].join("\n");
}
