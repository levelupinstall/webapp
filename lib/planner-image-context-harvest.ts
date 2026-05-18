/**
 * Full-history context harvest for concept-image generation (separate from Alex chat copy).
 */

import { deriveNorthStarLabelsFromUserText } from "@/lib/planner-intake-detect";
import { stripPlannerPhaseMarkers } from "@/lib/planner-phase-utils";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import {
  EMPTY_REFINEMENT_GEOMETRY_INTENT,
  formatRefinementChangeRequest,
  formatRefinementLayoutLockLine,
  type RefinementGeometryIntent,
} from "@/lib/planner-refinement-geometry";
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

/** One-line layout spec for image prompts (first render or locked on refinement). */
export function formatCompactLayoutSpec(harvest: HarvestedPlannerImageContext): string {
  const fc = harvest.spec;
  const w = harvest.phase2WidthIn;
  const d = harvest.phase2DepthIn;
  const style = harvest.phase1Style ?? "as discussed";
  const parts: string[] = [];

  if (fc.designCategory) parts.push(fc.designCategory);
  else parts.push("finish carpentry concept");

  parts.push(`${style} style`);

  if (fc.shelfCount !== null) {
    const floating =
      /float/i.test(`${fc.designCategory ?? ""} ${harvest.phase4ScopeSummary ?? ""}`);
    parts.push(
      `${fc.shelfCount} ${floating ? "floating " : ""}shelf${fc.shelfCount === 1 ? "" : "ves"}`,
    );
  }

  const dims: string[] = [];
  if (fc.shelfBoardSpanAlongWallIn !== null) dims.push(`${fc.shelfBoardSpanAlongWallIn}" long`);
  if (d !== null) dims.push(`${d}" deep`);
  if (w !== null && fc.shelfBoardSpanAlongWallIn === null) dims.push(`${w}" wall width`);
  if (dims.length) parts.push(`each ${dims.join(", ")}`);

  if (fc.shelfVerticalSpacingIn !== null) {
    parts.push(`${fc.shelfVerticalSpacingIn}" vertical spacing between tiers`);
  }

  const scopeBlob = `${harvest.spec.scopeNotes ?? ""} ${harvest.phase4ScopeSummary ?? ""}`;
  const clockBelow = /(\d+)\s*(?:'|′|ft|feet|in(?:ch(?:es)?)?)?\s*(?:under|below)\s+(?:the\s+)?clock/i.exec(
    scopeBlob,
  );
  if (clockBelow?.[1]) {
    parts.push(`top shelf ${clockBelow[1]}" below the clock`);
  }

  return parts.join("; ");
}

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
  /**
   * When the concept image request attaches **room → structural blueprint → baseline**, the prior
   * sketch must be described as the **last** image; otherwise baseline-first order keeps "first".
   */
  refinementBaselineAttachmentPosition?: "first" | "last";
  refinementGeometryIntent?: RefinementGeometryIntent;
}): { promptContext: string; userGoal: string } {
  const {
    harvest,
    hasUploadedSpacePhoto,
    hasRefinementBaselineImage,
    assistantReplySummary,
    northStarGoalSummary,
    lastUserFeedback,
    visualMode,
    refinementBaselineAttachmentPosition = "first",
    refinementGeometryIntent,
  } = params;
  const geometryIntent = refinementGeometryIntent ?? EMPTY_REFINEMENT_GEOMETRY_INTENT;
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

  const layoutLine = formatCompactLayoutSpec(harvest);
  const isCloset =
    transcriptSuggestsCloset(
      `${harvest.spec.designCategory ?? ""} ${harvest.phase4ScopeSummary ?? ""}`,
    );

  let userGoal: string;

  if (visualMode === "refinement-delta") {
    const baselineNote = hasRefinementBaselineImage
      ? refinementBaselineAttachmentPosition === "last"
        ? "The LAST attached image is the prior concept render — edit that image only."
        : "The FIRST attached image is the prior concept render — edit that image only."
      : "No prior concept image attached — match room photos and locked layout below.";

    const spaceNote = hasUploadedSpacePhoto
      ? "Earlier attached images are the real room (proportion/trim only) — do not redesign shelves from scratch."
      : "";

    userGoal = [
      baselineNote,
      spaceNote,
      formatRefinementLayoutLockLine(layoutLine, geometryIntent),
      formatRefinementChangeRequest(lastUserFeedback, geometryIntent),
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    const photoLead = hasUploadedSpacePhoto
      ? "Anchor to the attached room photo(s): real walls, ceiling, trim, and proportions."
      : "Neutral blank studio room if no space photo — illustrative proportions only.";

    userGoal = [
      photoLead,
      `Render: ${layoutLine}.`,
      `Style: ${style}; finishes: ${material}.`,
      obstruction !== "avoid conflicting with visible outlets, vents, and trim unless the transcript calls out a specific change"
        ? `Site: ${obstruction.slice(0, 400)}.`
        : null,
      scope !== "honor final scope only as stated in the conversation"
        ? `Scope: ${scope.slice(0, 400)}.`
        : null,
      isCloset
        ? "Include believable closet rod/hanger scale only if this is closet storage."
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const promptContext =
    visualMode === "refinement-delta"
      ? [
          `Refinement · ${harvest.phase1Style ?? "style as baseline"}`,
          geometryIntent.hasGeometryChange
            ? `Target layout: ${layoutLine}`
            : `Layout lock: ${layoutLine}`,
          harvest.phase3VisionSummary
            ? `Room cues: ${harvest.phase3VisionSummary.slice(0, 280)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          `First concept render`,
          `Style: ${harvest.phase1Style ?? "—"}`,
          `Dimensions: ${w ?? "—"} × ${h ?? "—"} × ${d ?? "—"} in (W×H×D)`,
          harvest.phase3VisionSummary
            ? `Site: ${harvest.phase3VisionSummary.slice(0, 320)}`
            : "",
          harvest.phase4ScopeSummary
            ? `Scope: ${harvest.phase4ScopeSummary.slice(0, 320)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

  return { promptContext, userGoal };
}
