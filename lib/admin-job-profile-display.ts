import { dwellingImpliesCondo } from "@/lib/planner-submit-design-labor";

export type ShoppingListRowDisplay = {
  description: string;
  qty: string;
  retailCad: string;
  sourcingHref: string;
  sourcingLabel: string;
  notes: string;
};

/** Condo vs simplified residential bucket for CRM headers. */
export function classifyDwellingForAdmin(dwellingTypeRaw: string): {
  label: "Condominium / strata" | "House / low-rise";
  detail: string;
} {
  const detail = dwellingTypeRaw.trim() || "Not specified";
  if (dwellingImpliesCondo(detail)) {
    return { label: "Condominium / strata", detail };
  }
  return { label: "House / low-rise", detail };
}

function pickOptionalUrl(row: Record<string, unknown>): string | null {
  const keys = ["sourceUrl", "sourcingUrl", "retailerUrl", "url", "link"] as const;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
      return v.trim();
    }
  }
  const links = row.links;
  if (Array.isArray(links)) {
    for (const item of links) {
      if (typeof item === "string" && /^https?:\/\//i.test(item.trim())) return item.trim();
      if (item && typeof item === "object" && "url" in item) {
        const u = (item as { url?: unknown }).url;
        if (typeof u === "string" && /^https?:\/\//i.test(u.trim())) return u.trim();
      }
    }
  }
  return null;
}

/** Fallback retailer discovery when the pipeline did not persist URLs. */
export function fallbackSourcingSearchUrl(description: string): string {
  const q = description.trim() || "finish carpentry materials Canada";
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function normalizeShoppingListForDisplay(shoppingList: unknown): ShoppingListRowDisplay[] {
  if (!Array.isArray(shoppingList)) return [];

  const rows: ShoppingListRowDisplay[] = [];

  for (const raw of shoppingList) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const description =
      typeof row.description === "string"
        ? row.description.trim()
        : typeof row.name === "string"
          ? row.name.trim()
          : "";
    if (!description) continue;

    let estimatedCad = 0;
    if (typeof row.estimatedCad === "number" && Number.isFinite(row.estimatedCad)) {
      estimatedCad = row.estimatedCad;
    } else if (typeof row.unitPriceCad === "number" && Number.isFinite(row.unitPriceCad)) {
      estimatedCad = row.unitPriceCad;
    }

    const qty =
      row.qty !== undefined && row.qty !== null && String(row.qty).trim() !== ""
        ? String(row.qty)
        : "—";

    const notes =
      typeof row.notes === "string" && row.notes.trim()
        ? row.notes.trim()
        : typeof row.retailer === "string" && row.retailer.trim()
          ? row.retailer.trim()
          : "—";

    const direct = pickOptionalUrl(row);
    const sourcingHref = direct ?? fallbackSourcingSearchUrl(description);
    const sourcingLabel = direct ? "Open source" : "Find retailers";

    rows.push({
      description,
      qty,
      retailCad:
        estimatedCad > 0
          ? new Intl.NumberFormat("en-CA", {
              style: "currency",
              currency: "CAD",
            }).format(estimatedCad)
          : "—",
      sourcingHref,
      sourcingLabel,
      notes,
    });
  }

  return rows;
}

export type LaborHoursBreakdownDisplay = {
  baseLaborHours: number | null;
  floorAccessBufferHours: number | null;
  condoBufferHours: number | null;
  hoursBeforeMargin: number | null;
  carpentryMarginMultiplier: number | null;
  estimatedTotalHours: number | null;
};

export function parseLaborBreakdownForDisplay(
  laborBreakdown: unknown,
  fallbackTotalHours: number,
): LaborHoursBreakdownDisplay {
  const empty: LaborHoursBreakdownDisplay = {
    baseLaborHours: null,
    floorAccessBufferHours: null,
    condoBufferHours: null,
    hoursBeforeMargin: null,
    carpentryMarginMultiplier: null,
    estimatedTotalHours: Number.isFinite(fallbackTotalHours) ? fallbackTotalHours : null,
  };

  if (!laborBreakdown || typeof laborBreakdown !== "object") return empty;
  const root = laborBreakdown as Record<string, unknown>;
  const labor =
    root.labor && typeof root.labor === "object" && !Array.isArray(root.labor)
      ? (root.labor as Record<string, unknown>)
      : null;

  if (!labor) return empty;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return {
    baseLaborHours: num(labor.baseLaborHours),
    floorAccessBufferHours: num(labor.floorAccessBufferHours),
    condoBufferHours: num(labor.condoBufferHours),
    hoursBeforeMargin: num(labor.hoursBeforeMargin),
    carpentryMarginMultiplier: num(labor.carpentryMarginMultiplier),
    estimatedTotalHours: num(labor.estimatedTotalHours) ?? empty.estimatedTotalHours,
  };
}
