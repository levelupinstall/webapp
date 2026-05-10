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
  /** Ceiling height in feet when the homeowner stated it (e.g. 10, 12). */
  ceilingHeightFeet: number | null;
};

export type AdaptiveScaleOptions = {
  hasUserProvidedPhoto: boolean;
  isCloset: boolean;
  ceilingHeightFeet: number | null;
};

/** Adaptive scale language for the image model only (not Alex chat copy). */
export function buildAdaptiveScaleInjection(opts: AdaptiveScaleOptions): string {
  const segments: string[] = [];

  if (opts.ceilingHeightFeet !== null && Number.isFinite(opts.ceilingHeightFeet)) {
    const ft = opts.ceilingHeightFeet;
    const label = ft === Math.floor(ft) ? String(Math.round(ft)) : String(ft);
    segments.push(`Render with ${label} foot ceiling height.`);
  }

  if (opts.hasUserProvidedPhoto) {
    segments.push(
      "Match the architectural scale of the homeowner's provided reference photo(s): align built-ins and trim with doors, windows, wall planes, floor line, and ceiling line visible in those images.",
    );
  }

  if (opts.isCloset) {
    segments.push(
      "Primary scale reference for depth and vertical proportions: standard clothing hangers on a closet rod (believable rod height and hanger silhouette); calibrate shelf depths and vertical stacking to that reference.",
    );
  } else {
    segments.push(
      "Primary room-scale anchors for open built-ins: standard electrical outlet height and baseboard trim relative to the floor — keep proportions consistent with typical residential construction.",
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

/** Parse ceiling height in feet from extraction JSON. */
export function parseCeilingFeetField(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 30) return value / 12;
    if (value >= 6 && value <= 24) return value;
    return null;
  }
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (!t || t === "null") return null;
    const inchM = t.match(/^(\d+(?:\.\d+)?)\s*(?:in|inch|inches)\b/);
    if (inchM) {
      const inches = parseFloat(inchM[1]);
      if (Number.isFinite(inches) && inches >= 72 && inches <= 288) {
        return inches / 12;
      }
    }
    const ftM = t.match(/(\d+(?:\.\d+)?)/);
    if (ftM) {
      const ft = parseFloat(ftM[1]);
      if (Number.isFinite(ft) && ft >= 6 && ft <= 24) return ft;
    }
  }
  return null;
}

/** Regex fallback when extraction omitted ceiling height (feet). */
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

  return {
    width: parseInchesField(raw.width),
    height: parseInchesField(raw.height),
    depth: parseInchesField(raw.depth),
    material: str(raw.material),
    style: str(raw.style),
    ceilingHeightFeet: parseCeilingFeetField(raw.ceilingHeightFeet ?? raw.ceiling_height_feet),
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

  const ceilingFeet =
    spec.ceilingHeightFeet ?? extractCeilingHeightFeetFromTranscript(ctx.extractionTranscript);

  segments.push(
    buildAdaptiveScaleInjection({
      hasUserProvidedPhoto: ctx.hasUserProvidedPhoto,
      isCloset: ctx.isCloset,
      ceilingHeightFeet: ceilingFeet,
    }),
  );

  return segments.join(" ");
}
