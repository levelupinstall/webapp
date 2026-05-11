/**
 * Full-history context harvest for concept-image generation (separate from Alex chat copy).
 */

import { deriveNorthStarLabelsFromUserText } from "@/lib/planner-intake-detect";
import { stripPlannerPhaseMarkers } from "@/lib/planner-phase-utils";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import {
  inferDesignCategoryBucket,
  illustrativeEnvelopeInchesForBucket,
  mergePlannerFixtureCounts,
  transcriptSuggestsCloset,
  emptyPlannerVisualSpec,
  workCategoryLabelFromDesignBucket,
  type PlannerVisualSpec,
} from "@/lib/planner-visual-spec";

function heuristicWorkCategoryFromDesignCategoryLabel(
  designCategory: string | null,
): string | null {
  const raw = designCategory?.trim();
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/\b(tv|television|media\s+wall|media\b)\b/i.test(t)) return "TV / media wall";
  if (
    /\bcloset\b/i.test(t) ||
    /\bwalk[\s-]?in\b/i.test(t) ||
    /\breach[\s-]?in\b/i.test(t)
  )
    return "Closet";
  if (/\b(trim|crown|baseboard|casing|wainscot)\b/i.test(t)) return "Trim / millwork";
  if (
    /\b(shelf|shelves|shelving|built|bookcase|storage\s+wall|cabinet|mudroom|pantry)\b/i.test(t)
  ) {
    return "Shelving / built-ins";
  }
  return null;
}

/** Effective North Star category for harvest fallbacks (prioritize intake labels, then transcript/category heuristics). */
export function resolveEffectiveWorkCategoryForHarvest(params: {
  northStarHomeownerOnly: string | null;
  extractionTranscript: string;
  designCategory: string | null;
}): string | null {
  if (params.northStarHomeownerOnly?.trim()) {
    return params.northStarHomeownerOnly.trim();
  }
  const fromTranscript = deriveNorthStarLabelsFromUserText(
    params.extractionTranscript,
  ).workCategory;
  if (fromTranscript) return fromTranscript;
  const fromDesign = heuristicWorkCategoryFromDesignCategoryLabel(
    params.designCategory,
  );
  if (fromDesign) return fromDesign;
  return workCategoryLabelFromDesignBucket(
    inferDesignCategoryBucket(params.extractionTranscript),
  );
}

export type HarvestedPlannerImageContext = {
  phase1Style: string | null;
  phase2WidthIn: number | null;
  phase2HeightIn: number | null;
  phase2DepthIn: number | null;
  phase2Material: string | null;
  phase3VisionSummary: string | null;
  phase4ScopeSummary: string | null;
  spec: PlannerVisualSpec;
  assumptionsLogged: string[];
};

const CLOSET_DEFAULT_DEPTH_IN = 24;

function extractVisionAndScopeHints(fullText: string): {
  phase3: string | null;
  phase4: string | null;
} {
  const lines = fullText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const phase3Bits: string[] = [];
  const phase4Bits: string[] = [];

  const obstruction =
    /(outlet|vent|switch|duct|soffit|window|door\s+jamb|baseboard|crown|ceiling|trim)/i;
  const scopeAdd =
    /(adding|add\s+|led\s|lighting|strip\s+light|under[\s-]?cabinet|glass|drawer|pull)/i;
  const scopeRemove = /(remov(?:e|ing)|take\s+out|wire\s+rack|old\s+shelf)/i;

  for (const line of lines) {
    if (line.length > 220) continue;
    if (obstruction.test(line) && phase3Bits.length < 6) {
      phase3Bits.push(line);
    }
    if ((scopeAdd.test(line) || scopeRemove.test(line)) && phase4Bits.length < 6) {
      phase4Bits.push(line);
    }
  }

  return {
    phase3: phase3Bits.length ? [...new Set(phase3Bits)].join(" ") : null,
    phase4: phase4Bits.length ? [...new Set(phase4Bits)].join(" ") : null,
  };
}

function applyMissingDimensionDefaults(
  spec: PlannerVisualSpec,
  isCloset: boolean,
  assumptions: string[],
): PlannerVisualSpec {
  const out = { ...spec };

  if (isCloset && out.depth === null) {
    out.depth = CLOSET_DEFAULT_DEPTH_IN;
    assumptions.push(
      `Depth missing — using standard closet section depth ${CLOSET_DEFAULT_DEPTH_IN}"`,
    );
  }

  if (out.width === null) {
    assumptions.push(
      "Width not extracted — infer span from reference photo and transcript",
    );
  }
  if (out.height === null) {
    assumptions.push(
      "Height not extracted — infer vertical envelope from reference photo and transcript",
    );
  }
  if (!isCloset && out.depth === null) {
    assumptions.push(
      "Depth not extracted — infer depth from category and photo",
    );
  }

  return out;
}

/** Scan entire planner thread (markers stripped) for extraction + harvest. */
export function buildFullPlannerTranscriptForHarvest(
  messages: Array<{ role: string; content: string }>,
): string {
  return messages
    .map((m) => {
      const body =
        m.role === "assistant" ? stripPlannerPhaseMarkers(m.content) : m.content;
      const label = m.role === "assistant" ? PLANNER_ASSISTANT_NAME : "Homeowner";
      return `${label}: ${body}`;
    })
    .join("\n")
    .trim();
}

export type HarvestPlannerContextParams = {
  extractionTranscript: string;
  baseSpec: PlannerVisualSpec | null;
};

export function harvestPlannerImageContextFromTranscript(
  params: HarvestPlannerContextParams,
): HarvestedPlannerImageContext {
  const assumptions: string[] = [];
  const combinedUserBlob = params.extractionTranscript
    .split("\n")
    .filter((line) => line.startsWith("Homeowner:"))
    .map((line) => line.replace(/^Homeowner:\s*/, ""))
    .join("\n");

  const ns = deriveNorthStarLabelsFromUserText(combinedUserBlob);
  const phase1Style =
    ns.stylePreference ?? params.baseSpec?.style?.trim() ?? null;

  let spec: PlannerVisualSpec = params.baseSpec
    ? { ...params.baseSpec }
    : emptyPlannerVisualSpec();

  const isCloset = transcriptSuggestsCloset(params.extractionTranscript);
  spec = applyMissingDimensionDefaults(spec, isCloset, assumptions);
  spec = mergePlannerFixtureCounts(spec, params.extractionTranscript);

  const hints = extractVisionAndScopeHints(params.extractionTranscript);
  const phase3VisionSummary =
    hints.phase3 ||
    (spec.scopeNotes && /outlet|vent|trim|crown|ceiling|wall/i.test(spec.scopeNotes)
      ? spec.scopeNotes
      : null);
  const phase4ScopeSummary =
    hints.phase4 ||
    (spec.scopeNotes && /(add|remov|led|light|rack|drawer|shelf)/i.test(spec.scopeNotes)
      ? spec.scopeNotes
      : null);

  return {
    phase1Style,
    phase2WidthIn: spec.width,
    phase2HeightIn: spec.height,
    phase2DepthIn: spec.depth,
    phase2Material: spec.material ?? null,
    phase3VisionSummary,
    phase4ScopeSummary,
    spec,
    assumptionsLogged: assumptions,
  };
}

export function logHarvestAssumptions(label: string, assumptions: string[]): void {
  if (assumptions.length === 0) return;
  console.info(`[planner-image-harvest] ${label}`, assumptions);
}

/** Carry-forward North Star / use-case text from homeowner turns. */
export function buildNorthStarGoalSummaryFromMessages(
  messages: Array<{ role: string; content: string }>,
): string {
  const blob = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n");
  return blob.slice(0, 2800);
}

export type HarvestPromptVisualMode = "first-render" | "refinement-delta";

function carpentryEnvelopeFallbackByCategory(
  workCategory: string | null,
): { width: number; height: number; depth: number } | null {
  switch (workCategory) {
    case "Closet":
      return { width: 72, height: 84, depth: 24 };
    case "TV / media wall":
      return { width: 120, height: 42, depth: 18 };
    case "Shelving / built-ins":
      return { width: 96, height: 84, depth: 14 };
    case "Trim / millwork":
      return { width: 144, height: 96, depth: 8 };
    default:
      return null;
  }
}

function styleFallbackForCategory(workCategory: string | null): string {
  switch (workCategory) {
    case "Closet":
      return "clean contemporary closet millwork";
    case "TV / media wall":
      return "modern integrated media wall";
    case "Shelving / built-ins":
      return "warm transitional built-in shelving";
    case "Trim / millwork":
      return "classic residential trim package";
    default:
      return "contemporary residential finish carpentry";
  }
}

/**
 * When style or all envelope dims are missing, apply category defaults and log (still proceed).
 * @param options.transcriptForDimFallback — used to infer illustrative W×H×D when all dims are null but `workCategory` is null.
 */
export function applyHarvestSafetyCategoryFallbacks(
  harvest: HarvestedPlannerImageContext,
  workCategory: string | null,
  options?: { transcriptForDimFallback?: string | null },
): HarvestedPlannerImageContext {
  const assumptions: string[] = [];
  let spec = { ...harvest.spec };
  let phase1Style = harvest.phase1Style;
  let w = harvest.phase2WidthIn;
  let h = harvest.phase2HeightIn;
  let d = harvest.phase2DepthIn;

  const missingStyle = !phase1Style?.trim();
  const missingAllDims = w === null && h === null && d === null;

  if (missingStyle) {
    phase1Style = styleFallbackForCategory(workCategory);
    spec = { ...spec, style: phase1Style };
    assumptions.push(
      `Style missing after harvest — defaulted to category profile (${workCategory ?? "general"})`,
    );
  }

  if (missingAllDims) {
    let fb = workCategory ? carpentryEnvelopeFallbackByCategory(workCategory) : null;
    let dimSourceLabel: string | null = workCategory;

    if (!fb && workCategory?.trim()) {
      fb = illustrativeEnvelopeInchesForBucket("shelving_builtin");
      dimSourceLabel = `${workCategory.trim()} (non-standard category — shelving illustration)`;
    }

    if (!fb && options?.transcriptForDimFallback?.trim()) {
      const bucket = inferDesignCategoryBucket(options.transcriptForDimFallback);
      fb = illustrativeEnvelopeInchesForBucket(bucket);
      dimSourceLabel =
        workCategoryLabelFromDesignBucket(bucket) ?? `designBucket:${bucket}`;
    }
    if (!fb) {
      fb = illustrativeEnvelopeInchesForBucket("general");
      dimSourceLabel = dimSourceLabel ?? "general illustrative shelving";
    }

    w = fb.width;
    h = fb.height;
    d = fb.depth;
    spec = { ...spec, width: w, height: h, depth: d };
    assumptions.push(
      `All dimensions missing — applied illustrative envelope ${w}"×${h}"×${d}" (${dimSourceLabel ?? "unspecified"})`,
    );
  }

  if (missingStyle || missingAllDims) {
    console.warn("[planner-image-harvest] Safety: incomplete harvest — using fallbacks", {
      workCategory,
      assumptions,
    });
    logHarvestAssumptions("safety-fallback", assumptions);
  }

  return {
    ...harvest,
    phase1Style,
    phase2WidthIn: w,
    phase2HeightIn: h,
    phase2DepthIn: d,
    spec,
    assumptionsLogged: [...harvest.assumptionsLogged, ...assumptions],
  };
}

export function buildHarvestConceptPromptBundle(params: {
  harvest: HarvestedPlannerImageContext;
  hasUploadedSpacePhoto: boolean;
  hasRefinementBaselineImage: boolean;
  assistantReplySummary: string;
  northStarGoalSummary: string;
  lastUserFeedback: string;
  visualMode: HarvestPromptVisualMode;
}): { promptContext: string; userGoal: string } {
  const {
    harvest,
    hasUploadedSpacePhoto,
    hasRefinementBaselineImage,
    assistantReplySummary,
    northStarGoalSummary,
    lastUserFeedback,
    visualMode,
  } = params;
  const style = harvest.phase1Style ?? "the homeowner's stated design direction";
  const material =
    harvest.phase2Material ?? "appropriate generic painted or stained wood tones (no brands)";

  const w = harvest.phase2WidthIn;
  const h = harvest.phase2HeightIn;
  const d = harvest.phase2DepthIn;
  const dimTriple =
    w !== null && h !== null && d !== null
      ? `${w}"×${h}"×${d}" (W×H×D inches)`
      : [w, h, d]
          .map((n, i) => (n !== null ? `${["W", "H", "D"][i]}=${n}"` : null))
          .filter(Boolean)
          .join(", ") ||
        "dimensions inferred from the reference photo and transcript where not stated";

  const obstruction =
    harvest.phase3VisionSummary?.trim() ||
    "avoid conflicting with visible outlets, vents, and trim unless the transcript calls out a specific change";
  const scope =
    harvest.phase4ScopeSummary?.trim() ||
    "honor final scope only as stated in the conversation";

  const northStarBlock =
    northStarGoalSummary.trim().length > 0
      ? `Project North Star / homeowner goals (full thread; preserve intent):\n${northStarGoalSummary.slice(0, 2200)}`
      : "";

  let userGoal: string;

  if (visualMode === "refinement-delta") {
    const baseline = hasRefinementBaselineImage
      ? "REFINEMENT — DELTA UPDATE: The FIRST attached image is the previous planner concept rendering — treat it as the baseline. Apply ONLY the changes implied by the homeowner's latest feedback and the assistant reply. Keep room architecture, materials, trim character, and overall layout identical to that baseline unless the user explicitly asked to change them."
      : "REFINEMENT — No baseline concept image was attached; infer carefully from space references and transcript.";

    const spaceNote = hasUploadedSpacePhoto
      ? "Additional reference image(s) after the baseline show the real space — use for proportion and trim alignment when editing."
      : "";

    userGoal = [
      baseline,
      spaceNote,
      northStarBlock,
      `Incorporate the ${style} aesthetic with ${material} finishes (carry North Star forward).`,
      `Respect envelope ${dimTriple} where applicable; ${obstruction}; scope: ${scope}.`,
      "Include standard clothing hangers on a rod where closet/storage context applies, and a standard ~6 ft tall interior door frame or doorway in the background where believable to anchor 1:1 human scale.",
      `Latest homeowner feedback: ${lastUserFeedback.slice(0, 1200)}`,
      `Assistant reply (what to implement): ${assistantReplySummary.slice(0, 800)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    const photoLead = hasUploadedSpacePhoto
      ? "Based on the uploaded photo of the user's actual space, match the room's actual walls, ceiling line, and flooring — preserve openings and proportions visible in that photo."
      : "Limited or no space photo in this request — use realistic residential scale and transcript cues.";

    userGoal = [
      northStarBlock,
      photoLead,
      `Incorporate the ${style} aesthetic with ${material} finishes.`,
      `Strictly adhere to the envelope ${dimTriple} and ensure ${obstruction} where applicable; reflect scope: ${scope}.`,
      "Include standard clothing hangers on a rod where closet/storage context applies, and a standard ~6 ft tall interior door frame or doorway in the background where believable to anchor 1:1 human scale.",
      `Design intent from the latest assistant reply: ${assistantReplySummary.slice(0, 800)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const fc = harvest.spec;
  const hasFixtureCounts =
    fc.shelfCount !== null || fc.drawerCount !== null || fc.closetRodCount !== null;
  const hasSpacing = fc.shelfVerticalSpacingIn !== null;
  const hasShelfSpan = fc.shelfBoardSpanAlongWallIn !== null;
  if (hasFixtureCounts || hasSpacing || hasShelfSpan) {
    const parts: string[] = [];
    if (fc.shelfCount !== null) parts.push(`${fc.shelfCount} shelf(es)`);
    if (fc.drawerCount !== null) parts.push(`${fc.drawerCount} drawer(s)`);
    if (fc.closetRodCount !== null) parts.push(`${fc.closetRodCount} hanging rod(s)`);
    if (fc.shelfVerticalSpacingIn !== null) {
      parts.push(`~${fc.shelfVerticalSpacingIn}" vertical spacing between shelf tiers`);
    }
    if (fc.shelfBoardSpanAlongWallIn !== null) {
      parts.push(`each shelf board ≤${fc.shelfBoardSpanAlongWallIn}" along the wall (not full-wall span)`);
    }
    userGoal = `${userGoal}\n\nReinforce exact layout numbers in the render: ${parts.join(", ")} — match counts and stated spacing; no extras.`;
  }

  const promptContext = [
    "## Harvested intake (all phases)",
    `Mode: ${visualMode}`,
    `Phase 1 — Style: ${harvest.phase1Style ?? "—"}`,
    `Phase 2 — W×H×D (in): ${w ?? "—"} × ${h ?? "—"} × ${d ?? "—"}; material: ${harvest.phase2Material ?? "—"}`,
    `Phase 3 — Vision / site: ${harvest.phase3VisionSummary ?? "—"}`,
    `Phase 4 — Scope adds/removals: ${harvest.phase4ScopeSummary ?? "—"}`,
    harvest.spec.scopeNotes ? `Scope notes: ${harvest.spec.scopeNotes}` : "",
    harvest.spec.shelfVerticalSpacingIn !== null
      ? `Stated shelf tier spacing: ${harvest.spec.shelfVerticalSpacingIn}" (vertical)`
      : "",
    harvest.spec.shelfBoardSpanAlongWallIn !== null
      ? `Stated max shelf board span (along wall): ${harvest.spec.shelfBoardSpanAlongWallIn}"`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { promptContext, userGoal };
}
