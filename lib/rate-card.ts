/**
 * Business rate card — Tom's pricing inputs for the AI estimate engine.
 *
 * Stored in the `business_settings` table (single row, id "default"), editable
 * in the admin CRM. Uses raw SQL so it never depends on a regenerated Prisma
 * client; the table is created by migration 20260930160000_business_settings.
 */

import { prisma } from "@/lib/prisma";

export type RateCard = {
  laborRateCad: number;
  callOutFeeCad: number;
  procurementMarkupPct: number;
  defaultSubRateCad: number;
  includedLaborHours: number;
  carpentryMarginPct: number;
};

export const RATE_CARD_DEFAULTS: RateCard = {
  laborRateCad: 75,
  callOutFeeCad: 150,
  procurementMarkupPct: 15,
  defaultSubRateCad: 50,
  includedLaborHours: 2,
  carpentryMarginPct: 15,
};

type SettingsRow = {
  id: string;
  labor_rate_cad: number;
  call_out_fee_cad: number;
  procurement_markup_pct: number;
  default_sub_rate_cad: number;
  included_labor_hours: number;
  carpentry_margin_pct: number;
};

function rowToCard(row: SettingsRow | undefined | null): RateCard {
  if (!row) return { ...RATE_CARD_DEFAULTS };
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  return {
    laborRateCad: num(row.labor_rate_cad, RATE_CARD_DEFAULTS.laborRateCad),
    callOutFeeCad: num(row.call_out_fee_cad, RATE_CARD_DEFAULTS.callOutFeeCad),
    procurementMarkupPct: num(
      row.procurement_markup_pct,
      RATE_CARD_DEFAULTS.procurementMarkupPct,
    ),
    defaultSubRateCad: num(row.default_sub_rate_cad, RATE_CARD_DEFAULTS.defaultSubRateCad),
    includedLaborHours: num(
      row.included_labor_hours,
      RATE_CARD_DEFAULTS.includedLaborHours,
    ),
    carpentryMarginPct: num(
      row.carpentry_margin_pct,
      RATE_CARD_DEFAULTS.carpentryMarginPct,
    ),
  };
}

let cached: { at: number; card: RateCard } | null = null;
const CACHE_MS = 60_000;

export function invalidateRateCardCache(): void {
  cached = null;
}

export async function getRateCard(): Promise<RateCard> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.card;
  try {
    const rows = await prisma.$queryRaw<SettingsRow[]>`
      SELECT id, labor_rate_cad, call_out_fee_cad, procurement_markup_pct,
             default_sub_rate_cad, included_labor_hours, carpentry_margin_pct
      FROM business_settings WHERE id = 'default' LIMIT 1`;
    const card = rowToCard(rows[0]);
    cached = { at: Date.now(), card };
    return card;
  } catch {
    // Table missing (migration not yet applied) — fall back to defaults.
    return { ...RATE_CARD_DEFAULTS };
  }
}

export async function updateRateCard(patch: Partial<RateCard>): Promise<RateCard> {
  const current = await getRateCard();
  const next: RateCard = { ...current };
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  for (const key of Object.keys(RATE_CARD_DEFAULTS) as Array<keyof RateCard>) {
    const v = num(patch[key]);
    if (v !== null) next[key] = key === "procurementMarkupPct" || key === "carpentryMarginPct"
      ? Math.min(500, v)
      : Math.min(10000, v);
  }
  await prisma.$executeRaw`
    INSERT INTO business_settings
      (id, labor_rate_cad, call_out_fee_cad, procurement_markup_pct,
       default_sub_rate_cad, included_labor_hours, carpentry_margin_pct, updated_at)
    VALUES ('default', ${next.laborRateCad}, ${next.callOutFeeCad},
      ${next.procurementMarkupPct}, ${next.defaultSubRateCad},
      ${next.includedLaborHours}, ${next.carpentryMarginPct}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      labor_rate_cad = EXCLUDED.labor_rate_cad,
      call_out_fee_cad = EXCLUDED.call_out_fee_cad,
      procurement_markup_pct = EXCLUDED.procurement_markup_pct,
      default_sub_rate_cad = EXCLUDED.default_sub_rate_cad,
      included_labor_hours = EXCLUDED.included_labor_hours,
      carpentry_margin_pct = EXCLUDED.carpentry_margin_pct,
      updated_at = NOW()`;
  invalidateRateCardCache();
  cached = { at: Date.now(), card: next };
  return next;
}
