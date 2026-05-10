/**
 * Planner concept-image pipeline: extracted dimensions + carpenter corrections + scale injection.
 * Keeps Alex/chat persona separate — used only for image generation prompts.
 */

export type PlannerVisualSpec = {
  width: number | null;
  height: number | null;
  depth: number | null;
  material: string | null;
  style: string | null;
  /** Phase 1 — category label from transcript extraction (image prompt + CRM). */
  designCategory: string | null;
  /** Short intake narrative for CRM / prompts (optional). */
  scopeNotes: string | null;
  /** Storey / finished-floor level when the homeowner stated it (e.g. 2 = second floor). */
  floor: number | null;
  /** Condo / apartment style dwelling when inferable from chat. */
  isCondo: boolean | null;
};

export type DesignCategoryBucket =
  | "closet"
  | "tv_wall"
  | "shelving_builtin"
  | "trim_millwork"
  | "general";

export type AdaptiveScaleOptions = {
  hasUserProvidedPhoto: boolean;
  isCloset: boolean;
  /** From transcript regex — used only when there are no reference photos (photo wins). */
  ceilingHeightFeet: number | null;
  categoryBucket?: DesignCategoryBucket;
};

/** Adaptive scale language for the image model only (not Alex chat copy). */
export function buildAdaptiveScaleInjection(opts: AdaptiveScaleOptions): string {
  const segments: string[] = [];

  if (opts.hasUserProvidedPhoto) {
    segments.push(
      "CRITICAL — Reference photo authority: Match the visible ceiling height (floor-to-ceiling proportion), crown molding, baseboard height and profile, door and window casing, and other trim exactly as shown in the attached homeowner photo(s). Do not inflate ceiling height, stretch verticals, or change trim scale relative to that imagery — the photograph defines ceiling line and trim character.",
    );
  } else if (opts.ceilingHeightFeet !== null && Number.isFinite(opts.ceilingHeightFeet)) {
    const ft = opts.ceilingHeightFeet;
    const label = ft === Math.floor(ft) ? String(Math.round(ft)) : String(ft);
    segments.push(`Render with ${label} foot ceiling height (no reference photo — transcript-derived).`);
  }

  segments.push(
    "Primary human-scale calibration: standard clothing hangers on a closet rod (believable rod height and hanger silhouette) — use this reference consistently so shelving and cabinets are never oversized relative to realistic residential proportions.",
  );

  const bucket = opts.categoryBucket ?? "general";

  if (opts.isCloset || bucket === "closet") {
    segments.push(
      "Closet context: align shelf depths and vertical stacking to that hanger-and-rod scale so cavity depth reads believably.",
    );
  } else if (bucket === "tv_wall") {
    segments.push(
      "Category scale anchors — TV / media wall: reference a typical flat-panel TV module width (~42–65\") against an adjacent standard interior door frame (~28–36\" clear opening) and duplex outlet vertical placement (~12–18\" AFF to bottom of plate when inferring); keep bracket depth realistic.",
    );
    segments.push(
      "Secondary anchors where visible: baseboard height and crown/ceiling line from the reference photo.",
    );
  } else if (bucket === "trim_millwork") {
    segments.push(
      "Category scale anchors — trim / millwork: preserve interior door casing proportions (~80–84\" strike zone to header typical), 3–6\" baseboard height bands, and crown depth consistent with residential norms.",
    );
  } else if (bucket === "shelving_builtin") {
    segments.push(
      "Category scale anchors — shelving / built-ins: use standard interior door leaf height (~80\") and hinge-side jamb as vertical calibration for bookcase stacks and spans.",
    );
    segments.push(
      "Secondary anchors where visible: outlets at typical bedside/kitchen counter bands only when applicable.",
    );
  } else {
    segments.push(
      "Secondary room anchors where visible: standard electrical outlet height and baseboard trim relative to the floor; interior door frame proportions (~80\" leaf height) when doors appear.",
    );
  }

  segments.push(
    "Photorealistic; no wide-angle distortion; maintaining 1:1 realistic carpentry proportions.",
  );

  return segments.join(" ");
}

export function transcriptSuggestsCloset(text: string): boolean {
  return /\bclosets?\b|walk[\s-]?in|wardrobe|reach[\s-]?in|coat\s+closet|linen\s+closet|pantry\b/i.test(
    text,
  );
}

/** Map chat + category labels to scale-anchor bucket for image prompts. */
export function inferDesignCategoryBucket(text: string): DesignCategoryBucket {
  const t = text.toLowerCase();
  if (/\btv\b|television|mount\b|media\s+wall/i.test(t)) return "tv_wall";
  if (/\btrim\b|crown|baseboard|casing|wainscot/i.test(t)) return "trim_millwork";
  if (transcriptSuggestsCloset(t)) return "closet";
  if (/\bshelf|shelving|built[\s-]?ins?\b|built\s+in|bookcase|mudroom|pantry|cabinet\s+run/i.test(t)) {
    return "shelving_builtin";
  }
  return "general";
}

export function parseInchesField(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "null") return null;
    const m = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

export function parseFloorField(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    if (n >= -5 && n <= 200) return n;
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === "null") return null;
    const digit = trimmed.match(/-?\d+/);
    if (digit) {
      const n = parseInt(digit[0], 10);
      if (n >= -5 && n <= 200) return n;
    }
  }
  return null;
}

export function parseBooleanLoose(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (["true", "yes", "y", "condo", "apartment", "apt"].includes(t)) return true;
    if (["false", "no", "n", "house", "detached"].includes(t)) return false;
  }
  return null;
}

/** Regex fallback when transcript mentions ceiling height (feet) — used only without reference photos. */
export function extractCeilingHeightFeetFromTranscript(text: string): number | null {
  const samples = text.match(/[^\n]{0,120}/g) ?? [];
  const ceilingLine = samples.find((line) => /\bceil(?:ing)?s?\b/i.test(line));
  const hay = ceilingLine ?? text;

  const patterns: RegExp[] = [
    /\bceil(?:ing)?s?\s+(?:is|are|at|about|around|of|roughly|approximately)\s+(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s+(?:high|tall)?\s*ceil(?:ing)?s?\b/i,
    /\b(\d+)\s*[-']?\s*(?:ft|foot|feet)\s+ceil(?:ing)?s?\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\b(?=[^.]{0,40}ceil)/i,
  ];

  for (const re of patterns) {
    const m = hay.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n) && n >= 6 && n <= 24) return n;
    }
  }
  return null;
}

export function normalizeVisualSpec(raw: Record<string, unknown>): PlannerVisualSpec {
  const str = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") {
      const t = v.trim();
      return t.length ? t : null;
    }
    return null;
  };

  let material = str(raw.material);
  let style = str(raw.style);
  /** Strip accidental pricing leakage from LLM output (should stay in background only). */
  const scrubPricing = (s: string | null): string | null => {
    if (!s) return null;
    if (/\$\s*\d|hourly|\$\s*150\b|\b150\s*dollar|\d\s*\$\s*\/\s*hr|\b\/hr\b/i.test(s)) {
      return null;
    }
    return s;
  };
  material = scrubPricing(material);
  style = scrubPricing(style);

  let designCategory = str(raw.designCategory);
  let scopeNotes = str(raw.scopeNotes);
  designCategory = scrubPricing(designCategory);
  scopeNotes = scrubPricing(scopeNotes);
  if (designCategory && designCategory.length > 500) {
    designCategory = designCategory.slice(0, 500);
  }
  if (scopeNotes && scopeNotes.length > 2000) {
    scopeNotes = scopeNotes.slice(0, 2000);
  }

  return {
    width: parseInchesField(raw.width),
    height: parseInchesField(raw.height),
    depth: parseInchesField(raw.depth),
    material,
    style,
    designCategory,
    scopeNotes,
    floor: parseFloorField(raw.floor),
    isCondo: parseBooleanLoose(raw.isCondo),
  };
}

/** Carpenter logic: if depth > height, swap depth and height (vertical vs cavity depth). */
export function applyCarpenterLogicToSpec(spec: PlannerVisualSpec): PlannerVisualSpec {
  let { width, height, depth } = spec;
  if (height !== null && depth !== null && depth > height) {
    const h = height;
    height = depth;
    depth = h;
  }
  return { ...spec, width, height, depth };
}

/** Typical closet shelf/cabinet depth when not stated. */
export function applyClosetDefaultDepth(
  spec: PlannerVisualSpec,
  isCloset: boolean,
): PlannerVisualSpec {
  if (!isCloset) return spec;
  if (spec.depth === null) {
    return { ...spec, depth: 24 };
  }
  return spec;
}

export function applyFullCarpenterPipeline(
  spec: PlannerVisualSpec,
  transcriptForClosetHint: string,
): PlannerVisualSpec {
  const closet = transcriptSuggestsCloset(transcriptForClosetHint);
  return applyClosetDefaultDepth(applyCarpenterLogicToSpec(spec), closet);
}

export type ExtractedDirectiveScaleContext = {
  hasUserProvidedPhoto: boolean;
  isCloset: boolean;
  extractionTranscript: string;
};

/** Directive appended to the image model prompt (not shown to homeowners). */
export function buildExtractedVisualDirective(
  spec: PlannerVisualSpec,
  ctx: ExtractedDirectiveScaleContext,
): string {
  const segments: string[] = [];

  const dimParts: string[] = [];
  if (spec.width !== null) dimParts.push(`${spec.width}" W`);
  if (spec.height !== null) dimParts.push(`${spec.height}" H`);
  if (spec.depth !== null) dimParts.push(`${spec.depth}" D`);

  if (dimParts.length > 0) {
    segments.push(
      `Use these corrected envelope dimensions as primary scale guides (Width × Height × Depth): ${dimParts.join(" × ")}.`,
    );
  }
  if (spec.material) {
    segments.push(`Materials / finishes (generic, unbranded): ${spec.material}.`);
  }
  if (spec.style) {
    segments.push(`Style direction: ${spec.style}.`);
  }
  if (spec.designCategory) {
    segments.push(`Project category (North Star): ${spec.designCategory}.`);
  }
  if (spec.scopeNotes) {
    segments.push(`Scope / survey notes (no pricing): ${spec.scopeNotes}`);
  }

  const categoryBucket = inferDesignCategoryBucket(
    `${spec.designCategory ?? ""} ${ctx.extractionTranscript}`,
  );

  if (spec.floor !== null) {
    segments.push(
      `Storey / finished-floor context from intake: floor level ${spec.floor} — keep vertical proportions consistent with typical residential floor-to-floor relationships.`,
    );
  }
  if (spec.isCondo === true) {
    segments.push(
      "Dwelling: condominium / apartment-style — depths and bulk should respect typical condo constraints when inferring layout.",
    );
  }

  const ceilingFeet = extractCeilingHeightFeetFromTranscript(ctx.extractionTranscript);

  segments.push(
    buildAdaptiveScaleInjection({
      hasUserProvidedPhoto: ctx.hasUserProvidedPhoto,
      isCloset: ctx.isCloset,
      ceilingHeightFeet: ceilingFeet,
      categoryBucket,
    }),
  );

  return segments.join(" ");
}
