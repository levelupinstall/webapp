import type { BlueprintPlan } from "@/lib/blueprint-engine";
import type { PlannerVisualSpec } from "@/lib/planner-visual-spec";

export type LayoutConflict = {
  code: string;
  detail: string;
  clarifyingQuestion: string;
};

/** Count interior horizontal shelf tiers from normalized elevation lines (excludes outer shell band). */
export function countShelvingTiersInPlan(plan: BlueprintPlan): number {
  const buckets = new Set<number>();
  for (const L of plan.lines) {
    if (Math.abs(L.y1 - L.y2) > 0.02) continue;
    if (L.x2 - L.x1 < 0.12) continue;
    const y = (L.y1 + L.y2) / 2;
    if (y <= 0.095 || y >= 0.905) continue;
    buckets.add(Math.round(y * 400) / 400);
  }
  return buckets.size;
}

/** Count closet rod lines (long horizontals in the rod span band). */
export function countClosetRodsInPlan(plan: BlueprintPlan): number {
  let n = 0;
  for (const L of plan.lines) {
    if (Math.abs(L.y1 - L.y2) > 0.02) continue;
    if (L.x2 - L.x1 < 0.35) continue;
    if (L.x1 < 0.15 || L.x2 > 0.85) continue;
    n++;
  }
  return n;
}

/**
 * Before spending GPU on a render, ensure the **blueprint geometry** matches the **locked spec counts**.
 * If not, we refuse to visualize and ask the homeowner to clarify so Alex can realign.
 */
export function detectBlueprintLayoutConflicts(
  plan: BlueprintPlan,
  spec: PlannerVisualSpec,
): LayoutConflict[] {
  const out: LayoutConflict[] = [];

  if (plan.category === "SHELVING" && spec.shelfCount != null && spec.shelfCount > 0) {
    const tiers = countShelvingTiersInPlan(plan);
    if (tiers !== spec.shelfCount) {
      out.push({
        code: "shelf_count_mismatch",
        detail: `The structural blueprint shows **${tiers}** visible shelf tier(s) on the elevation, but the locked specification says **${spec.shelfCount}** shelf board(s)/tiers.`,
        clarifyingQuestion: `Which count should we lock for your first rendering — **${spec.shelfCount}** tiers, or **${tiers}** — and should any tiers be split into shorter boards (e.g. around outlets)? Reply with the final shelf **count** you want on this wall.`,
      });
    }
  }

  if (plan.category === "CLOSET" && spec.closetRodCount != null && spec.closetRodCount > 0) {
    const rods = countClosetRodsInPlan(plan);
    if (rods !== spec.closetRodCount) {
      out.push({
        code: "closet_rod_mismatch",
        detail: `The structural blueprint shows **${rods}** hanging rod line(s), but the locked specification says **${spec.closetRodCount}** rod(s).`,
        clarifyingQuestion: `How many hanging rods should we lock in — **${spec.closetRodCount}** or **${rods}**? If you want double-hang on one level, say so explicitly (e.g. “two rods, one high / one low”).`,
      });
    }
  }

  if (plan.category === "CLOSET" && spec.drawerCount != null && spec.drawerCount > 0) {
    const drawers = plan.rects.length;
    if (drawers !== spec.drawerCount) {
      out.push({
        code: "closet_drawer_mismatch",
        detail: `The structural blueprint shows **${drawers}** drawer stack block(s), but the locked specification says **${spec.drawerCount}** drawer(s).`,
        clarifyingQuestion: `Confirm the **drawer count** we should lock for the rendering — **${spec.drawerCount}** or **${drawers}**?`,
      });
    }
  }

  return out;
}
