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
  /** Counts from extraction / transcript (null = unknown). Integers 0–99. */
  shelfCount: number | null;
  drawerCount: number | null;
  closetRodCount: number | null;
  /**
   * Clear vertical spacing between shelf tiers when the homeowner stated it (inches).
   * Distinct from overall unit `height`.
   */
  shelfVerticalSpacingIn: number | null;
  /**
   * Max horizontal extent of each shelf board / tier (inches), distinct from full-unit `width` along the wall.
   * Use when the homeowner asks for shorter shelves, e.g. "24 inch shelves", "not as long".
   */
  shelfBoardSpanAlongWallIn: number | null;
};

export function emptyPlannerVisualSpec(): PlannerVisualSpec {
  return {
    width: null,
    height: null,
    depth: null,
    material: null,
    style: null,
    designCategory: null,
    scopeNotes: null,
    floor: null,
    isCondo: null,
    shelfCount: null,
    drawerCount: null,
    closetRodCount: null,
    shelfVerticalSpacingIn: null,
    shelfBoardSpanAlongWallIn: null,
  };
}

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

/** Convert a positive magnitude + unit label to inches (for JSON + transcript). */
export function valueToInches(n: number, unitRaw: string | undefined | null): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unitRaw === undefined || unitRaw === null || unitRaw === "") return n;
  const u = unitRaw.toLowerCase().replace(/\./g, "").trim();
  if (u === '"' || u === "in" || u === "inch" || u === "inches") return n;
  if (u === "ft" || u === "foot" || u === "feet" || u === "'") return n * 12;
  if (u === "mm" || u.startsWith("millim")) return n / 25.4;
  if (u === "cm" || u.startsWith("centim")) return n / 2.54;
  if (u === "m" || u.startsWith("meter") || u.startsWith("metre")) return n * 39.37007874015748;
  return n;
}

/**
 * Parse width/height/depth from JSON when the model returns a string with units
 * (e.g. "240 cm", "2.4m", "about 91 in") or a plain number (inches).
 */
export function parseDimensionFieldToInches(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (!t || t === "null") return null;
    const loose = t.match(
      /^(?:~|approx\.?|approximately|about|around|roughly|close\s+to|near(?:ly)?|circa|something\s+like|i\s*'?d\s+say|maybe|or\s+so|give\s+or\s+take|more\s+or\s+less)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|millimeters?|centimeters?|meters?|metres?|in(?:ches)?\.?|"|'|ft|feet|foot)?\s*$/i,
    );
    if (loose) {
      const num = parseFloat(loose[1]);
      const inches = valueToInches(num, loose[2]);
      if (inches !== null) return inches;
    }
    const embedded = t.match(
      /(?:~|approx\.?|approximately|about|around|roughly|close\s+to|near(?:ly)?|circa|or\s+so|give\s+or\s+take|more\s+or\s+less)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|millimeters?|centimeters?|meters?|metres?|in(?:ches)?\.?|"|'|ft|feet|foot)\b/i,
    );
    if (embedded) {
      const num = parseFloat(embedded[1]);
      const inches = valueToInches(num, embedded[2]);
      if (inches !== null) return inches;
    }
    const glued = t.match(
      /^(?:~|approx\.?|approximately|about|around|roughly)?\s*(\d+(?:\.\d+)?)(mm|cm|m)\s*$/i,
    );
    if (glued) {
      const inches = valueToInches(parseFloat(glued[1]), glued[2]);
      if (inches !== null) return inches;
    }
    return parseInchesField(value);
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

/** Inches for envelope or spacing; allow modest decimals, clamp to plausible carpentry ranges. */
export function parseInchesFieldClamped(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const raw = parseDimensionFieldToInches(value);
  if (raw === null || !Number.isFinite(raw)) return null;
  const n = Math.round(raw * 10) / 10;
  if (n < min || n > max) return null;
  return n;
}

export function parseCountField(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    if (n >= 0 && n <= 99) return n;
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === "null") return null;
    const m = trimmed.match(/^(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 99) return n;
    }
  }
  return null;
}

/** Word integers one–twelve for transcript fixture counts only. */
const WORD_NUMBER_SMALL: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

export function extractFixtureCountsFromTranscript(text: string): Pick<
  PlannerVisualSpec,
  "shelfCount" | "drawerCount" | "closetRodCount"
> {
  const t = text.toLowerCase();
  let shelfCount: number | null = null;
  let drawerCount: number | null = null;

  const numericOrWord =
    "\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";

  const resolveTok = (tok: string): number | null => {
    const tl = tok.toLowerCase();
    if (/^\d+$/.test(tl)) {
      const n = parseInt(tl, 10);
      return n >= 0 && n <= 99 ? n : null;
    }
    const w = WORD_NUMBER_SMALL[tl];
    return w !== undefined && w >= 0 && w <= 99 ? w : null;
  };

  function hangRodValue(full: string, digitCap: string | undefined): number | null {
    const f = full.toLowerCase();
    if (/\btriple\b/.test(f) || /\bthree\b/.test(f)) return 3;
    if (/\bdouble\b/.test(f) || /\bdual\b/.test(f)) return 2;
    if (/\bsingle\b/.test(f) || /\bone\b/.test(f)) return 1;
    if (/\btwo\b/.test(f)) return 2;
    if (digitCap) {
      const d = parseInt(digitCap, 10);
      if (Number.isFinite(d) && d >= 0 && d <= 99) return d;
    }
    return null;
  }

  type CountHit = { index: number; value: number };
  const rodHits: CountHit[] = [];

  const hangRe =
    /\b(?:double|triple|dual|single|one|two|three|(\d+))\s*-?\s*hang\b/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hangRe.exec(t))) {
    const n = hangRodValue(hm[0] ?? "", hm[1]);
    if (n !== null && hm.index !== undefined) rodHits.push({ index: hm.index, value: n });
  }

  const shelfRe = new RegExp(
    `(${numericOrWord})\\s+(?:adjustable\\s+|fixed\\s+|wood(?:en)?\\s+)?shelves\\b|` +
      `(${numericOrWord})\\s+(?:adjustable\\s+|fixed\\s+|wood(?:en)?\\s+)?shelf\\b`,
    "gi",
  );
  for (const m of t.matchAll(shelfRe)) {
    const tok = String(m[1] ?? m[2] ?? "").toLowerCase();
    const n = resolveTok(tok);
    if (n !== null) shelfCount = n;
  }

  const drawerRe = new RegExp(
    `(${numericOrWord})\\s+(?:soft\\s*-?\\s*close\\s+)?drawers?\\b`,
    "gi",
  );
  for (const m of t.matchAll(drawerRe)) {
    const tok = String(m[1] ?? "").toLowerCase();
    const n = resolveTok(tok);
    if (n !== null) drawerCount = n;
  }

  const rodRe = new RegExp(
    `(${numericOrWord})\\s+(?:closet\\s+)?(?:hanging\\s+)?(?:bars?|rods?)\\b|` +
      `(${numericOrWord})\\s+(?:closet\\s+|garment\\s+)?rods?\\b`,
    "gi",
  );
  for (const m of t.matchAll(rodRe)) {
    const tok = String(m[1] ?? m[2] ?? "").toLowerCase();
    const n = resolveTok(tok);
    if (n !== null && m.index !== undefined) {
      rodHits.push({ index: m.index, value: n });
    }
  }

  const closetRodCount =
    rodHits.reduce<CountHit | null>(
      (best, cur) =>
        best === null || cur.index >= best.index ? cur : best,
      null,
    )?.value ?? null;

  return { shelfCount, drawerCount, closetRodCount };
}

const DIM_W = [12, 360] as const;
const DIM_H = [12, 192] as const;
const DIM_D = [4, 48] as const;
const DIM_SP = [4, 60] as const;
const DIM_SHELF_SPAN = [8, 120] as const;

function clampDim(n: number, lo: number, hi: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const r = Math.round(n * 10) / 10;
  if (r < lo || r > hi) return null;
  return r;
}

/** Optional hedge words before or between tokens (transcript is lowercased). */
const MAY_APX =
  "(?:~|approx\\.?|approximately|about|around|roughly|close\\s+to|near(?:ly)?|circa|something\\s+like|maybe|or\\s+so|give\\s+or\\s+take|more\\s+or\\s+less)\\s*";

function lastDimAcrossPatterns(
  hay: string,
  patterns: Array<{ re: RegExp; toInches: (m: RegExpExecArray) => number | null; clamp: readonly [number, number] }>,
): number | null {
  type Hit = { index: number; value: number };
  let best: Hit | null = null;
  for (const { re, toInches, clamp } of patterns) {
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(hay)) !== null) {
      if (m.index === undefined) continue;
      const inches = toInches(m);
      if (inches === null) continue;
      const c = clampDim(inches, clamp[0], clamp[1]);
      if (c !== null && (best === null || m.index >= best.index)) {
        best = { index: m.index, value: c };
      }
    }
  }
  return best?.value ?? null;
}

/**
 * Regex fallback: pull stated width/height/depth (inches) and shelf tier spacing from homeowner language.
 * Supports mm / cm / m / in / ft and phrases like "about" or "approximately" (still locked to the numeric value).
 * Last matching mention wins. Does not override non-null spec fields (merge fills nulls only).
 */
export function extractStatedDimensionsFromTranscript(text: string): Pick<
  PlannerVisualSpec,
  | "width"
  | "height"
  | "depth"
  | "shelfVerticalSpacingIn"
  | "shelfBoardSpanAlongWallIn"
> {
  const hay = text.toLowerCase();

  const nu = (m: RegExpExecArray, i = 1) => parseFloat(m[i]);
  const fromUnit = (m: RegExpExecArray) => valueToInches(nu(m, 1), m[2]);
  const fromFt = (m: RegExpExecArray) => valueToInches(nu(m, 1) * 12, "in");

  const width = lastDimAcrossPatterns(hay, [
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)(mm|cm|m)\\s*(?:wide|width|span|run|along|opening|long)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_W,
    },
    {
      re: new RegExp(
        `(?:width|span|wall\\s+run|opening)\\s*(?:is|of|at|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_W,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s*(?:wide|width|span|run|along\\s+the\\s+wall|long)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_W,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')\\s*(?:wide|width|span|run|along|opening|long)\\b`,
        "gi",
      ),
      toInches: fromFt,
      clamp: DIM_W,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:wide|width|span|run|along|opening|long)\b/gi,
      toInches: fromFt,
      clamp: DIM_W,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:"|in(?:ches)?\.?)\s*(?:wide|width|span|run|along\s+the\s+wall|long)\b/gi,
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_W,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:"|in(?:ches)?\.?)\s+(?:long|length)\s+(?:shelf|shelves|unit|run|built[\s-]?in)/gi,
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_W,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\s+(?:long|length)\\s+(?:shelf|shelves|unit|run|built[\\s-]?in)`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_W,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s+(?:long|length)\s+(?:shelf|shelves|unit|run|built[\s-]?in)/gi,
      toInches: fromFt,
      clamp: DIM_W,
    },
    {
      re: new RegExp(
        `(?:width|span|wall\\s+run|opening)\\s*(?:is|of|at|about|around|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')\\b`,
        "gi",
      ),
      toInches: fromFt,
      clamp: DIM_W,
    },
    {
      re: new RegExp(
        `(?:width|span|run|opening)\\s*(?:is|of|at|about|around|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_W,
    },
  ]);

  const height = lastDimAcrossPatterns(hay, [
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)(mm|cm|m)\\s*(?:tall|high|height)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_H,
    },
    {
      re: new RegExp(
        `(?:height|tall)\\s*(?:is|of|at|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_H,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s*(?:tall|high|height)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_H,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')\\s*(?:tall|high|height)\\b`,
        "gi",
      ),
      toInches: fromFt,
      clamp: DIM_H,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:tall|high|height)\b/gi,
      toInches: fromFt,
      clamp: DIM_H,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:"|in(?:ches)?\.?)\s*(?:tall|high|height)\b/gi,
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_H,
    },
    {
      re: new RegExp(
        `(?:height|tall)\\s*(?:is|of|at|about|around|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')\\b`,
        "gi",
      ),
      toInches: fromFt,
      clamp: DIM_H,
    },
    {
      re: new RegExp(
        `(?:height|tall)\\s*(?:is|of|at|about|around|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_H,
    },
  ]);

  const depth = lastDimAcrossPatterns(hay, [
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)(mm|cm|m)\\s*(?:deep|depth)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_D,
    },
    {
      re: new RegExp(
        `(?:depth|deep)\\s*(?:is|of|at|about|around|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_D,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s*(?:deep|depth)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_D,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:"|in(?:ches)?\.?)\s*(?:deep|depth)\b/gi,
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_D,
    },
    {
      re: new RegExp(
        `(?:depth|deep)\\s*(?:is|of|at|about|around|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_D,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s*(?:deep|depth)\\s+(?:shelf|shelves|shelving|unit)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_D,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\s+(?:deep|depth)\\s+(?:shelf|shelves|shelving|unit)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_D,
    },
  ]);

  const shelfVerticalSpacingIn = lastDimAcrossPatterns(hay, [
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)(mm|cm|m)\\s+between\\s+(?:each\\s+)?(?:shelf|shelves|tier|tiers)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s+between\\s+(?:each\\s+)?(?:shelf|shelves|tier|tiers)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SP,
    },
    {
      re: /(\d+(?:\.\d+)?)\s*(?:"|in(?:ches)?\.?)\s+between\s+(?:each\s+)?(?:shelf|shelves|tier|tiers)\b/gi,
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `between\\s+(?:each\\s+)?(?:shelf|shelves|tier|tiers)[^\\n\\d]{0,45}${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `between\\s+(?:each\\s+)?(?:shelf|shelves|tier|tiers)[^\\n\\d]{0,45}${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?)`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\s+(?:gap|spacing)\\s+(?:between|for)\\s+(?:the\\s+)?(?:shelf|shelves|tiers?)`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s+(?:gap|spacing)\\s+(?:between|for)\\s+(?:the\\s+)?(?:shelf|shelves|tiers?)`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `shelf(?:ing)?\\s+spacing\\s*(?:is|of|at|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `shelf(?:ing)?\\s+spacing\\s*(?:is|of|at|=|:)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?)`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SP,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s+(?:apart|spacing)\\s+for\\s+(?:the\\s+)?(?:shelf|shelves)`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SP,
    },
  ]);

  const shelfBoardSpanAlongWallIn = lastDimAcrossPatterns(hay, [
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)(mm|cm|m)\\s+shelves?\\b(?!\\s*,\\s*deep)`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_SHELF_SPAN,
    },
    {
      re: new RegExp(
        `${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\s+shelves?\\b(?!\\s*,\\s*deep)`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SHELF_SPAN,
    },
    {
      re: new RegExp(
        `shelves?\\s+(?:only|just|about|around|roughly|of|at)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_SHELF_SPAN,
    },
    {
      re: new RegExp(
        `shelves?\\s+(?:only|just|about|around|roughly|of|at)?\\s*${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SHELF_SPAN,
    },
    {
      re: new RegExp(
        `(?:not\\s+as\\s+long|shorter|less\\s+long|narrower)[^.\\n]{0,55}${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`,
        "gi",
      ),
      toInches: fromUnit,
      clamp: DIM_SHELF_SPAN,
    },
    {
      re: new RegExp(
        `(?:not\\s+as\\s+long|shorter|less\\s+long|narrower)[^.\\n]{0,55}${MAY_APX}(\\d+(?:\\.\\d+)?)\\s*(?:"|in(?:ches)?\\.?)\\b`,
        "gi",
      ),
      toInches: (m) => valueToInches(nu(m, 1), "in"),
      clamp: DIM_SHELF_SPAN,
    },
  ]);

  return { width, height, depth, shelfVerticalSpacingIn, shelfBoardSpanAlongWallIn };
}

export function mergePlannerStatedDimensionsFromTranscript(
  spec: PlannerVisualSpec,
  transcript: string,
): PlannerVisualSpec {
  const ex = extractStatedDimensionsFromTranscript(transcript);
  return {
    ...spec,
    width: spec.width ?? ex.width,
    height: spec.height ?? ex.height,
    depth: spec.depth ?? ex.depth,
    shelfVerticalSpacingIn: spec.shelfVerticalSpacingIn ?? ex.shelfVerticalSpacingIn,
    shelfBoardSpanAlongWallIn:
      spec.shelfBoardSpanAlongWallIn ?? ex.shelfBoardSpanAlongWallIn,
  };
}

export function mergePlannerFixtureCounts(
  spec: PlannerVisualSpec,
  transcript: string,
): PlannerVisualSpec {
  const ex = extractFixtureCountsFromTranscript(transcript);
  const withCounts: PlannerVisualSpec = {
    ...spec,
    shelfCount: spec.shelfCount ?? ex.shelfCount,
    drawerCount: spec.drawerCount ?? ex.drawerCount,
    closetRodCount: spec.closetRodCount ?? ex.closetRodCount,
  };
  return mergePlannerStatedDimensionsFromTranscript(withCounts, transcript);
}

/** Phase-1-style work-category label aligned with deriveNorthStar; `general` → null. */
export function workCategoryLabelFromDesignBucket(
  bucket: DesignCategoryBucket,
): string | null {
  switch (bucket) {
    case "closet":
      return "Closet";
    case "tv_wall":
      return "TV / media wall";
    case "shelving_builtin":
      return "Shelving / built-ins";
    case "trim_millwork":
      return "Trim / millwork";
    default:
      return null;
  }
}

/** Illustrative W×H×D (inches) for image fallback when all envelope dims are missing. */
export function illustrativeEnvelopeInchesForBucket(
  bucket: DesignCategoryBucket,
): { width: number; height: number; depth: number } {
  switch (bucket) {
    case "closet":
      return { width: 72, height: 84, depth: 24 };
    case "tv_wall":
      return { width: 120, height: 42, depth: 18 };
    case "trim_millwork":
      return { width: 144, height: 96, depth: 8 };
    case "shelving_builtin":
    case "general":
    default:
      return { width: 96, height: 84, depth: 14 };
  }
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
    width: parseInchesFieldClamped(raw.width, 12, 360),
    height: parseInchesFieldClamped(raw.height, 12, 192),
    depth: parseInchesFieldClamped(raw.depth, 4, 72),
    material,
    style,
    designCategory,
    scopeNotes,
    floor: parseFloorField(raw.floor),
    isCondo: parseBooleanLoose(raw.isCondo),
    shelfCount: parseCountField(raw.shelfCount),
    drawerCount: parseCountField(raw.drawerCount),
    closetRodCount: parseCountField(raw.closetRodCount),
    shelfVerticalSpacingIn: parseInchesFieldClamped(raw.shelfVerticalSpacingIn, 4, 60),
    shelfBoardSpanAlongWallIn: parseInchesFieldClamped(raw.shelfBoardSpanAlongWallIn, 8, 120),
  };
}

/** Carpenter logic: if depth > height, swap depth and height (vertical vs cavity depth). */
export function applyCarpenterLogicToSpec(spec: PlannerVisualSpec): PlannerVisualSpec {
  const { width } = spec;
  let { height, depth } = spec;
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
      `CRITICAL — Overall unit envelope (inches; homeowner-aligned): ${dimParts.join(" × ")}. Render the built-in / closet volume to these Width × Height × Depth targets on elevation — do not shrink or stretch the box arbitrarily relative to these numbers when they came from the transcript.`,
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

  const countBits: string[] = [];
  if (spec.shelfCount !== null) countBits.push(`${spec.shelfCount} shelf board(s)`);
  if (spec.drawerCount !== null) countBits.push(`${spec.drawerCount} drawer(s)`);
  if (spec.closetRodCount !== null)
    countBits.push(`${spec.closetRodCount} closet rod(s)/hanging bar(s)`);
  if (countBits.length > 0) {
    segments.push(
      `CRITICAL — Fixture counts (${countBits.join(", ")}): render exactly that many discrete shelves/drawers/hanging rods as visible usable elements in the sketch — **do not** add extras beyond what is counted; combine into a plausible layout that matches the homeowner request.`,
    );
  }
  if (spec.shelfVerticalSpacingIn !== null) {
    segments.push(
      `CRITICAL — Stated vertical spacing between shelf tiers: target ≈ ${spec.shelfVerticalSpacingIn}" clear or center-to-center as the homeowner described — keep visible shelf gaps consistent with this spacing across the stack (do not compress or stretch bands arbitrarily).`,
    );
  }
  if (spec.shelfBoardSpanAlongWallIn !== null) {
    segments.push(
      `CRITICAL — Per-shelf horizontal board extent: each visible shelf tier must not read longer than ≈ ${spec.shelfBoardSpanAlongWallIn}" left-to-right along the board (homeowner target). Do **not** stretch shelf boards to fill the entire wall opening if this limit applies — keep the shelf footprint visually within this span even when reference photos show a wider wall (overall unit width may still be larger if the design is a short stack of boards on a long wall).`,
    );
  }

  return segments.join(" ");
}
