/**
 * Detect size/position refinement intents and align harvest locks + image prompts.
 */

import type { HarvestedPlannerImageContext } from "@/lib/planner-image-context-harvest";
import {
  applyRefinementDimensionOverrides,
  type PlannerVisualSpec,
} from "@/lib/planner-visual-spec";

export type RefinementGeometryIntent = {
  hasGeometryChange: boolean;
  scaleShelfSpanFactor: number | null;
  scaleDepthFactor: number | null;
  verticalShift: "down" | "up" | null;
  /** "move it left / shift the unit right" — horizontal reposition of the whole assembly. */
  horizontalShift: "left" | "right" | null;
  /** User asked to change shelf size/position (not only color/finish). */
  repositionShelves: boolean;
};

export const EMPTY_REFINEMENT_GEOMETRY_INTENT: RefinementGeometryIntent = {
  hasGeometryChange: false,
  scaleShelfSpanFactor: null,
  scaleDepthFactor: null,
  verticalShift: null,
  horizontalShift: null,
  repositionShelves: false,
};

const COLOR_FINISH_ONLY =
  /\b(color|colour|paint|painted|stain|stained|finish|white|black|gray|grey|walnut|oak|natural|darker|lighter)\b/i;

const GEOMETRY_SIGNAL =
  /\b(?:smaller|bigger|larger|longer|shorter|narrower|wider|move\s+down|move\s+up|lower|higher|raise|drop|bring\s+down|shift\s+down|shift\s+up|closer\s+to\s+the\s+floor|closer\s+to\s+the\s+ceiling|not\s+as\s+(?:long|wide|tall|deep)|less\s+(?:wide|deep)|more\s+(?:wide|deep)|resize|reposition|spacing|spaced|apart|side\s+by\s+side|same\s+level|in\s+a\s+row|horizontally|vertically|stacked|below\s+the\s+clock|(?:move|shift|slide|push|nudge)(?:\s+\w+){0,4}\s+(?:over\s+)?(?:to\s+the\s+)?(?:left|right))\b/i;

function clampIn(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Latest homeowner + Alex confirmation text for refinement dimension parsing. */
export function buildRefinementFeedbackBlob(
  lastUserFeedback: string,
  assistantReplySummary?: string,
): string {
  return [lastUserFeedback.trim(), assistantReplySummary?.trim()]
    .filter(Boolean)
    .join("\n");
}

export function detectRefinementGeometryIntent(feedbackBlob: string): RefinementGeometryIntent {
  const t = feedbackBlob.trim();
  const p = t.toLowerCase();
  if (!t) {
    return {
      hasGeometryChange: false,
      scaleShelfSpanFactor: null,
      scaleDepthFactor: null,
      verticalShift: null,
      horizontalShift: null,
      repositionShelves: false,
    };
  }

  const geometrySignal = GEOMETRY_SIGNAL.test(p);
  const colorOnly =
    COLOR_FINISH_ONLY.test(p) &&
    !geometrySignal &&
    !/\b(inch|inches|"|′|ft|feet|mm|cm)\b/i.test(p);

  if (colorOnly) {
    return {
      hasGeometryChange: false,
      scaleShelfSpanFactor: null,
      scaleDepthFactor: null,
      verticalShift: null,
      horizontalShift: null,
      repositionShelves: false,
    };
  }

  let scaleShelfSpanFactor: number | null = null;
  let scaleDepthFactor: number | null = null;
  let verticalShift: "down" | "up" | null = null;
  let horizontalShift: "left" | "right" | null = null;

  if (
    /\b(smaller|shorter|not\s+as\s+long|less\s+long|narrower|reduce\s+the\s+size|make\s+(?:them|it|the\s+shelves?)\s+smaller)\b/i.test(
      p,
    )
  ) {
    scaleShelfSpanFactor = 0.85;
    scaleDepthFactor = 0.88;
  } else if (
    /\b(larger|longer|wider|bigger|make\s+(?:them|it|the\s+shelves?)\s+(?:longer|wider|bigger))\b/i.test(
      p,
    )
  ) {
    scaleShelfSpanFactor = 1.12;
    scaleDepthFactor = 1.1;
  }

  const shelfContext =
    /shelf|shelves|unit|stack|built-?in|them|it\b|the\s+shelves/i.test(p);
  if (
    /\b(move\s+down|lower|drop|bring\s+down|shift\s+down|closer\s+to\s+the\s+floor|down\s+a\s+bit|a\s+little\s+lower)\b/i.test(
      p,
    ) &&
    shelfContext
  ) {
    verticalShift = "down";
  } else if (
    /\b(move\s+up|higher|raise|shift\s+up|closer\s+to\s+the\s+ceiling|up\s+a\s+bit)\b/i.test(
      p,
    ) &&
    shelfContext
  ) {
    verticalShift = "up";
  }

  // Horizontal moves: verb + up to a few words + optional "over/to the" + left|right.
  // ("move the shelves to the left", "shift it right", "nudge them over to the left")
  const horizMatch =
    /\b(move|shift|slide|push|nudge)(?:\s+\w+){0,4}\s+(?:over\s+)?(?:to\s+the\s+)?(left|right)\b/i.exec(
      p,
    );
  if (horizMatch) {
    horizontalShift = horizMatch[2].toLowerCase() === "left" ? "left" : "right";
  } else if (/\bmore\s+to\s+the\s+left\b/i.test(p) || /\bfurther\s+left\b/i.test(p)) {
    horizontalShift = "left";
  } else if (
    /\bmore\s+to\s+the\s+right\b/i.test(p) ||
    /\bfurther\s+right\b/i.test(p)
  ) {
    horizontalShift = "right";
  }

  const repositionShelves =
    verticalShift !== null ||
    horizontalShift !== null ||
    scaleShelfSpanFactor !== null ||
    /\b(reposition|relocate|spacing|apart|between\s+(?:each\s+)?shelf)\b/i.test(p);

  const hasGeometryChange =
    geometrySignal &&
    (repositionShelves ||
      scaleShelfSpanFactor !== null ||
      verticalShift !== null ||
      horizontalShift !== null);

  return {
    hasGeometryChange,
    scaleShelfSpanFactor,
    scaleDepthFactor,
    verticalShift,
    horizontalShift,
    repositionShelves,
  };
}

/** Apply explicit inch overrides from latest feedback, then relative scale/shift hints. */
export function applyRefinementGeometryToSpec(
  spec: PlannerVisualSpec,
  feedbackBlob: string,
  intent: RefinementGeometryIntent,
): PlannerVisualSpec {
  let out = applyRefinementDimensionOverrides(spec, feedbackBlob);

  if (intent.scaleShelfSpanFactor && out.shelfBoardSpanAlongWallIn !== null) {
    out = {
      ...out,
      shelfBoardSpanAlongWallIn: clampIn(
        out.shelfBoardSpanAlongWallIn * intent.scaleShelfSpanFactor,
        8,
        120,
      ),
    };
  }

  if (intent.scaleDepthFactor && out.depth !== null) {
    out = {
      ...out,
      depth: clampIn(out.depth * intent.scaleDepthFactor, 4, 48),
    };
  }

  if (intent.verticalShift === "down" && out.shelfVerticalSpacingIn !== null) {
    out = {
      ...out,
      shelfVerticalSpacingIn: clampIn(out.shelfVerticalSpacingIn * 1.15, 4, 60),
    };
  } else if (intent.verticalShift === "up" && out.shelfVerticalSpacingIn !== null) {
    out = {
      ...out,
      shelfVerticalSpacingIn: clampIn(out.shelfVerticalSpacingIn * 0.88, 4, 60),
    };
  }

  if (intent.verticalShift === "down" && out.shelfVerticalSpacingIn === null) {
    out = { ...out, shelfVerticalSpacingIn: 18 };
  } else if (intent.verticalShift === "up" && out.shelfVerticalSpacingIn === null) {
    out = { ...out, shelfVerticalSpacingIn: 14 };
  }

  return out;
}

export function syncHarvestFromSpec(
  harvest: HarvestedPlannerImageContext,
  spec: PlannerVisualSpec,
): HarvestedPlannerImageContext {
  return {
    ...harvest,
    spec,
    phase2WidthIn: spec.width,
    phase2HeightIn: spec.height,
    phase2DepthIn: spec.depth,
  };
}

/** Delta instruction from the latest homeowner message (refinement). */
export function formatRefinementChangeRequest(
  lastUserFeedback: string,
  intent: RefinementGeometryIntent,
): string {
  const t = lastUserFeedback.trim();
  if (!t) return "Apply the latest homeowner feedback to the baseline concept image only.";

  const removeMatch =
    /remov(?:e|ing|al)?\s+(?:the\s+)?(.+?)(?:\.|$)/i.exec(t) ||
    /take\s+out\s+(?:the\s+)?(.+?)(?:\.|$)/i.exec(t);
  if (removeMatch?.[1]) {
    const subject = removeMatch[1].trim().slice(0, 200);
    return `CHANGE ONLY: Remove ${subject} from the scene. Keep all shelves, counts, spacing, and styling identical to the baseline concept image.`;
  }

  if (/float/i.test(t) && /shelf|shelves/i.test(t)) {
    return "CHANGE ONLY: Ensure shelves read as floating shelves (no visible side panels or bracket clutter) — keep count, spacing, and dimensions identical to the baseline unless stated otherwise.";
  }

  if (/add\s+(?:an?\s+)?extra|another|\d+\s*shelf/i.test(t) && /not|only|just/i.test(t)) {
    return "CHANGE ONLY: Do not add shelves — preserve the exact shelf count from the baseline concept image.";
  }

  if (intent.hasGeometryChange) {
    const parts: string[] = [
      "GEOMETRY CHANGE (required — do not return an unchanged copy of the baseline image):",
    ];
    if (intent.scaleShelfSpanFactor && intent.scaleShelfSpanFactor < 1) {
      parts.push(
        "Make each shelf board visibly shorter/narrower along the wall than in the baseline (rigid assembly — translate/scale, do not stretch pixels).",
      );
    } else if (intent.scaleShelfSpanFactor && intent.scaleShelfSpanFactor > 1) {
      parts.push(
        "Make each shelf board visibly longer/wider along the wall than in the baseline (rigid assembly).",
      );
    }
    if (intent.verticalShift === "down") {
      parts.push(
        "Move the entire shelf stack DOWN on the wall (more space above the top shelf / lower on the wall plane). The change must be obvious in the render.",
      );
    } else if (intent.verticalShift === "up") {
      parts.push(
        "Move the entire shelf stack UP on the wall (closer to ceiling / higher position). The change must be obvious in the render.",
      );
    }
    if (intent.horizontalShift === "left") {
      parts.push(
        "Shift the entire shelf assembly toward the LEFT side of the wall (roughly the left third of the wall run), keeping it at the same height. The change must be obvious in the render.",
      );
    } else if (intent.horizontalShift === "right") {
      parts.push(
        "Shift the entire shelf assembly toward the RIGHT side of the wall (roughly the right third of the wall run), keeping it at the same height. The change must be obvious in the render.",
      );
    }
    parts.push(`Homeowner request: ${t.slice(0, 600)}.`);
    parts.push(
      "Keep shelf count, style, and room architecture the same unless the request says otherwise.",
    );
    return parts.join(" ");
  }

  if (COLOR_FINISH_ONLY.test(t) && !GEOMETRY_SIGNAL.test(t)) {
    return `CHANGE ONLY (finish/color): ${t.slice(0, 600)}. Adjust shelf/board color or finish only — do not change shelf count, size, or vertical position.`;
  }

  return `CHANGE ONLY (homeowner request): ${t.slice(0, 800)}. Preserve everything else from the baseline concept image.`;
}

export function formatRefinementLayoutLockLine(
  layoutLine: string,
  intent: RefinementGeometryIntent,
): string {
  if (!intent.hasGeometryChange) {
    return `LOCKED LAYOUT: ${layoutLine}`;
  }
  return `TARGET LAYOUT (apply to baseline — override old positions/sizes): ${layoutLine}`;
}
