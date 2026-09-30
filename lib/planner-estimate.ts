/**
 * AI estimate engine for the planner sales pipeline.
 *
 * After a customer approves a concept, this builds a reviewable cost estimate:
 * materials (buy-vs-build classified) + labour + fees, all in CAD.
 * Tom reviews/adjusts it in the admin CRM (with an AI adjust agent) before it
 * ever reaches the customer.
 */

import {
  computePlannerLaborAndCharges,
  heuristicBaseLaborHours,
} from "@/lib/planner-submit-design-labor";
import type { PlannerSubmitDesignExtract } from "@/lib/planner-submit-design-types";
import {
  geminiEstimateMaterialsShoppingList,
  geminiTextChat,
  isGeminiConfigured,
  type GeminiShoppingListItem,
} from "@/lib/gemini-client";
import { randomUUID } from "crypto";

export const ESTIMATE_LABOR_RATE_CAD = 75;
export const ESTIMATE_CALL_OUT_FEE_CAD = 150;
/** Level Up procurement markup on buy-item supplier costs. */
export const ESTIMATE_PROCUREMENT_MARKUP = 1.15;

export type EstimateSourcing = "buy" | "build";
export type EstimateItemCategory = "material" | "labor" | "fee";

export type EstimateLineItem = {
  id: string;
  category: EstimateItemCategory;
  /** buy = premade product; build = custom-fabricated by the shop; na = labour/fees. */
  sourcing: EstimateSourcing | "na";
  description: string;
  detail?: string;
  quantity: number;
  unit: string;
  unitCostCad: number;
  totalCad: number;
};

export type EstimateStatus =
  | "draft"
  | "sent"
  | "site_measure"
  | "final_quote"
  | "approved"
  | "paid";

export type EstimateAiChatTurn = {
  role: "admin" | "assistant";
  content: string;
  at: string;
};

export type Estimate = {
  id: string;
  title: string;
  status: EstimateStatus;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  lineItems: EstimateLineItem[];
  materialsTotalCad: number;
  laborHours: number;
  laborTotalCad: number;
  feesTotalCad: number;
  totalCad: number;
  notes: string;
  aiChat: EstimateAiChatTurn[];
  sourceSummary: string;
};

const SOURCING_SYSTEM = `You classify finish-carpentry material items for a Toronto installer (Level Up Install).

For each item, decide:
- "buy": a FINISHED product the customer could buy premade (light fixtures, shelf brackets, prefinished floating shelves, paint, stain, hardware, LED strips, pre-made organizers).
- "build": anything CUSTOM-FABRICATED by a millwork shop from raw goods (custom-cut shelves, built-in units, wainscoting/trim milled to size, bench seats, closet systems built on site). Raw sheet goods and lumber that get cut down on site are "build".

Return ONLY valid JSON (no markdown fences):
{ "classifications": [ { "index": number, "sourcing": "buy"|"build", "reason": string } ] }

Rules:
- Every input index gets exactly one classification.
- Prefer "build" when the item will clearly be cut/fabricated to fit the space.
- Keep reasons under 12 words.`;

function parseSourcingJson(raw: string, count: number): EstimateSourcing[] {
  const fallback: EstimateSourcing[] = Array.from({ length: count }, () => "build");
  try {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(stripped) as {
      classifications?: Array<{ index?: unknown; sourcing?: unknown }>;
    };
    if (!Array.isArray(parsed.classifications)) return fallback;
    for (const c of parsed.classifications) {
      const i = typeof c.index === "number" ? c.index : -1;
      if (i < 0 || i >= count) continue;
      fallback[i] = c.sourcing === "buy" ? "buy" : "build";
    }
  } catch {
    /* fall through to all-build default */
  }
  return fallback;
}

async function classifySourcing(
  items: GeminiShoppingListItem[],
): Promise<EstimateSourcing[]> {
  if (items.length === 0) return [];
  if (!isGeminiConfigured()) return items.map(() => "build" as EstimateSourcing);
  const list = items
    .map((it, i) => `${i}. ${it.description}${it.notes ? ` (${it.notes})` : ""}`)
    .join("\n");
  const res = await geminiTextChat({
    systemInstruction: SOURCING_SYSTEM,
    history: [],
    message: `Classify these material items:\n${list}`,
  });
  if ("error" in res || !res.text.trim()) {
    return items.map(() => "build" as EstimateSourcing);
  }
  return parseSourcingJson(res.text, items.length);
}

function money(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

function lineItem(params: {
  category: EstimateItemCategory;
  sourcing: EstimateSourcing | "na";
  description: string;
  detail?: string;
  quantity?: number;
  unit?: string;
  unitCostCad?: number;
}): EstimateLineItem {
  const quantity = Math.max(0, params.quantity ?? 1);
  const unitCostCad = money(params.unitCostCad ?? 0);
  return {
    id: randomUUID(),
    category: params.category,
    sourcing: params.sourcing,
    description: params.description.trim().slice(0, 220),
    detail: params.detail?.trim().slice(0, 400) || undefined,
    quantity: Math.round(quantity * 100) / 100,
    unit: (params.unit ?? "each").slice(0, 24),
    unitCostCad,
    totalCad: money(quantity * unitCostCad),
  };
}

export function recomputeEstimateTotals(items: EstimateLineItem[]): {
  materialsTotalCad: number;
  laborHours: number;
  laborTotalCad: number;
  feesTotalCad: number;
  totalCad: number;
} {
  let materials = 0;
  let laborHours = 0;
  let labor = 0;
  let fees = 0;
  for (const it of items) {
    if (it.category === "material") materials += it.totalCad;
    else if (it.category === "labor") {
      labor += it.totalCad;
      if (/hour/i.test(it.unit)) laborHours += it.quantity;
    } else fees += it.totalCad;
  }
  const total = materials + labor + fees;
  return {
    materialsTotalCad: money(materials),
    laborHours: Math.round(laborHours * 100) / 100,
    laborTotalCad: money(labor),
    feesTotalCad: money(fees),
    totalCad: money(total),
  };
}

export type EstimateInput = {
  transcript: string;
  dimsSummary: string;
  dwellingLabel: string;
  category: string;
  widthIn?: number | null;
  heightIn?: number | null;
  depthIn?: number | null;
};

/**
 * Build a draft estimate from the planner conversation. Heavy AI work —
 * call from an admin action or background job, never inline in a chat reply.
 */
export async function generatePlannerEstimate(
  input: EstimateInput,
): Promise<Estimate> {
  const transcript = input.transcript.trim().slice(-16_000);
  const materials = await geminiEstimateMaterialsShoppingList({
    transcript,
    dimsSummary: input.dimsSummary,
    dwellingLabel: input.dwellingLabel,
  });
  const sourcing = await classifySourcing(materials.items);

  const items: EstimateLineItem[] = materials.items.map((m, i) => {
    const s = sourcing[i] ?? "build";
    const markedUp =
      s === "buy" ? m.estimatedCad * ESTIMATE_PROCUREMENT_MARKUP : m.estimatedCad;
    return lineItem({
      category: "material",
      sourcing: s,
      description: m.description,
      detail: [
        m.notes ?? "",
        s === "buy" ? "Includes 15% Level Up procurement markup." : "",
      ]
        .filter(Boolean)
        .join(" "),
      quantity: m.qty && m.qty > 0 ? m.qty : 1,
      unit: "each",
      unitCostCad: markedUp,
    });
  });

  const extraction: PlannerSubmitDesignExtract = {
    width: input.widthIn ?? null,
    height: input.heightIn ?? null,
    depth: input.depthIn ?? null,
    material: null,
    style: null,
    designCategory: input.category || null,
    scopeNotes: null,
    floorLevel: null,
    dwellingType: input.dwellingLabel || null,
    hasElevator: null,
    baseLaborHoursEstimate: heuristicBaseLaborHours(transcript),
  };
  const labor = computePlannerLaborAndCharges({
    extraction,
    dims: {
      width: input.widthIn ?? 0,
      height: input.heightIn ?? 0,
      depth: input.depthIn ?? 0,
    },
    materialCostCad: materials.totalMaterialCad,
  });

  items.push(
    lineItem({
      category: "labor",
      sourcing: "na",
      description: "Finish carpentry installation labour",
      detail: `Estimated ${labor.estimatedTotalHours.toFixed(1)} hours at $${ESTIMATE_LABOR_RATE_CAD}/hr (includes 15% complexity margin). Verify on site.`,
      quantity: Math.round(labor.estimatedTotalHours * 10) / 10,
      unit: "hours",
      unitCostCad: ESTIMATE_LABOR_RATE_CAD,
    }),
  );
  items.push(
    lineItem({
      category: "fee",
      sourcing: "na",
      description: "Call-out / site visit fee",
      quantity: 1,
      unit: "each",
      unitCostCad: ESTIMATE_CALL_OUT_FEE_CAD,
    }),
  );

  const totals = recomputeEstimateTotals(items);
  const now = new Date().toISOString();
  const categoryLabel = input.category?.trim() || "Custom project";
  return {
    id: randomUUID(),
    title: `${categoryLabel} — AI estimate`,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    lineItems: items,
    ...totals,
    notes: "",
    aiChat: [],
    sourceSummary: `Generated from the AI planning conversation${materials.grounded ? " (search-grounded pricing)" : ""}. Labour estimated at $${ESTIMATE_LABOR_RATE_CAD}/hr. Review every line before sending — dimensions and site conditions must be verified.`,
  };
}

const REVISE_SYSTEM = `You are the estimating assistant for Level Up Install (Toronto finish carpentry). Tom (the owner) gives plain-English instructions to adjust a cost estimate.

You receive the current estimate as JSON: { lineItems: [...], notes: string }.
Line item shape: { id, category: "material"|"labor"|"fee", sourcing: "buy"|"build"|"na", description, detail, quantity, unit, unitCostCad, totalCad }.

Apply Tom's instruction and return ONLY valid JSON (no markdown fences):
{ "lineItems": [ ...full updated array, same shape... ], "notes": string, "summary": string }

Rules:
- Return the COMPLETE line item array with your changes applied (add, remove, or edit items). Keep untouched items identical, including their ids.
- New items get fresh ids like "new-1", "new-2".
- "summary" is one short sentence describing what changed, for the chat log.
- Do NOT compute final totals — the platform recomputes them. Set each item's totalCad = quantity × unitCostCad yourself.
- Never invent supplier SKUs. Prices stay in CAD.
- If the instruction is unclear, make the most reasonable change and say what you assumed in "summary".`;

export async function reviseEstimateFromInstruction(params: {
  estimate: Estimate;
  instruction: string;
}): Promise<
  | { lineItems: EstimateLineItem[]; notes: string; summary: string }
  | { error: string }
> {
  if (!isGeminiConfigured()) return { error: "Gemini is not configured." };
  const payload = JSON.stringify({
    lineItems: params.estimate.lineItems,
    notes: params.estimate.notes,
  }).slice(0, 24_000);
  const res = await geminiTextChat({
    systemInstruction: REVISE_SYSTEM,
    history: [],
    message: `Current estimate JSON:\n${payload}\n\nTom's instruction: ${params.instruction.trim().slice(0, 2000)}\n\nReturn the revised JSON now.`,
  });
  if ("error" in res) return { error: res.error };
  const text = res.text.trim();
  if (!text) return { error: "The AI returned an empty response." };
  try {
    const stripped = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(stripped) as {
      lineItems?: unknown;
      notes?: unknown;
      summary?: unknown;
    };
    if (!Array.isArray(parsed.lineItems) || parsed.lineItems.length === 0) {
      return { error: "The AI did not return usable line items." };
    }
    const items: EstimateLineItem[] = [];
    for (const [idx, row] of parsed.lineItems.entries()) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const description =
        typeof r.description === "string" && r.description.trim()
          ? r.description.trim().slice(0, 220)
          : `Item ${idx + 1}`;
      const category =
        r.category === "labor" || r.category === "fee" ? r.category : "material";
      const sourcing =
        r.sourcing === "buy" || r.sourcing === "build" ? r.sourcing : "na";
      const quantity =
        typeof r.quantity === "number" && Number.isFinite(r.quantity) && r.quantity > 0
          ? Math.round(r.quantity * 100) / 100
          : 1;
      const unitCostCad =
        typeof r.unitCostCad === "number" && Number.isFinite(r.unitCostCad)
          ? money(r.unitCostCad)
          : 0;
      items.push({
        id: typeof r.id === "string" && r.id ? r.id : `new-${idx + 1}`,
        category,
        sourcing,
        description,
        detail:
          typeof r.detail === "string" && r.detail.trim()
            ? r.detail.trim().slice(0, 400)
            : undefined,
        quantity,
        unit:
          typeof r.unit === "string" && r.unit.trim()
            ? r.unit.trim().slice(0, 24)
            : "each",
        unitCostCad,
        totalCad: money(quantity * unitCostCad),
      });
    }
    if (items.length === 0) return { error: "The AI did not return usable line items." };
    return {
      lineItems: items,
      notes:
        typeof parsed.notes === "string" ? parsed.notes.slice(0, 4000) : params.estimate.notes,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 500)
          : "Estimate updated.",
    };
  } catch {
    return { error: "Could not parse the AI's revised estimate." };
  }
}

/** Render an estimate as Markdown for the final-quote proposal body. */
export function estimateToMarkdown(estimate: Estimate): string {
  const lines = [
    `## Estimate summary`,
    ``,
    `AI-prepared estimate reviewed by Level Up. All measurements and site conditions to be verified before work begins.`,
    ``,
    `| Item | Type | Qty | Unit cost | Total |`,
    `| --- | --- | --- | --- | --- |`,
  ];
  for (const it of estimate.lineItems) {
    const type =
      it.category === "material"
        ? it.sourcing === "buy"
          ? "Buy"
          : "Build"
        : it.category === "labor"
          ? "Labour"
          : "Fee";
    lines.push(
      `| ${it.description} | ${type} | ${it.quantity} ${it.unit} | $${it.unitCostCad.toFixed(2)} | $${it.totalCad.toFixed(2)} |`,
    );
  }
  lines.push(
    ``,
    `**Materials:** $${estimate.materialsTotalCad.toFixed(2)} · **Labour (${estimate.laborHours}h):** $${estimate.laborTotalCad.toFixed(2)} · **Fees:** $${estimate.feesTotalCad.toFixed(2)}`,
    ``,
    `## Investment`,
    ``,
    `**$${estimate.totalCad.toFixed(2)} CAD**`,
    ``,
  );
  if (estimate.notes.trim()) {
    lines.push(`## Notes`, ``, estimate.notes.trim(), ``);
  }
  lines.push(
    `## Next steps`,
    ``,
    `Reply to approve, or ask for changes — final measurements are confirmed on site before work is scheduled.`,
  );
  return lines.join("\n");
}
