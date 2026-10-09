import {
  LEVEL_UP_IMAGE_GEOMETRY_REFINEMENT_SUFFIX,
  LEVEL_UP_IMAGE_REFINEMENT_SUFFIX,
  LEVEL_UP_IMAGE_RENDER_SYSTEM,
} from "@/lib/level-up-gemini-persona";
import type { ImageRenderDirectiveMode } from "@/lib/planner-visual-spec";
import {
  normalizeVisualSpec,
  parseBooleanLoose,
  parseFloorField,
  parseInchesField,
  type PlannerVisualSpec,
} from "@/lib/planner-visual-spec";
import type { PlannerSubmitDesignExtract } from "@/lib/planner-submit-design-types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type GeminiInlineImage = {
  mimeType: string;
  dataBase64: string;
};

export type GeminiGenerateResult = {
  text: string;
  images: GeminiInlineImage[];
  blockReason?: string;
  /** First candidate finishReason when present (e.g. STOP, SAFETY) — for diagnostics when images are empty. */
  candidateFinishReason?: string;
};

type ContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

function getApiKey(): string | null {
  const k = process.env.GEMINI_API_KEY?.trim();
  return k || null;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getApiKey());
}

export function defaultGeminiTextModel(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-flash";
}

export function defaultGeminiImageModel(): string {
  return (
    process.env.GEMINI_IMAGE_MODEL?.trim() ||
    "gemini-3.1-flash-image"
  );
}

/** User message suggests generating a visual concept. */
export function userRequestedImageGeneration(message: string): boolean {
  const p = message.toLowerCase();
  return /\b(draw|sketch|picture|image|photo|visuali[sz]e|render|mock[\s-]?up|illustration|concept art|show me how|what would .* look)\b/.test(
    p,
  );
}

/** Homeowner sounds pleased or ready to move forward (used for booking / pipeline hints). */
export function homeownerSignalsHappyOrReady(message: string): boolean {
  const p = message.toLowerCase().trim();
  if (p.length < 4) return false;
  if (
    /\b(not\s+happy|unhappy|don'?t\s+like|doesn'?t\s+look\s+good|hate|awful|terrible|not\s+quite)\b/i.test(
      p,
    )
  ) {
    return false;
  }

  if (
    /\b(love\s+it|love\s+this|loving\s+it|looks\s+great|looks\s+amazing|looks\s+perfect|looks\s+good|looks\s+fantastic|perfect|exactly\s+what|that'?s\s+exactly|nailed\s+it|couldn'?t\s+be\s+better|so\s+happy|really\s+happy|really\s+pleased|happy\s+with|pleased\s+with|works\s+for\s+me|i'?m\s+sold|super\s+excited|really\s+excited|let'?s\s+(do\s+it|move\s+forward|book)|ready\s+to\s+book|book\s+(you|this|a\s+visit)|come\s+out|have\s+someone\s+out|schedule\s+(a\s+)?(visit|appointment)|next\s+step|move\s+forward\s+with)\b/i.test(
      p,
    )
  ) {
    return true;
  }

  if (/\b(i\s+really\s+like|i\s+love\s+it|i\s+like\s+it|this\s+is\s+(great|perfect|awesome))\b/i.test(p)) {
    return true;
  }

  if (
    /\b(yes|yeah|yep)\b/i.test(p) &&
    /\b(love|perfect|great|awesome|amazing|exactly)\b/i.test(p)
  ) {
    return true;
  }

  return false;
}

/**
 * Strong positive reaction without contrast words — usually no new refinement sketch needed.
 */
export function homeownerPureEnthusiasmAfterSketch(message: string): boolean {
  const t = message.trim();
  if (!homeownerSignalsHappyOrReady(t)) return false;
  const p = t.toLowerCase();
  if (/\b(but|except|however|although|though|only\s+issue)\b/.test(p)) return false;
  return true;
}

function extractInlineImageFromPart(part: unknown): GeminiInlineImage | null {
  if (!part || typeof part !== "object") return null;
  const o = part as Record<string, unknown>;
  const inline = (o.inlineData ?? o.inline_data) as
    | { mimeType?: string; mime_type?: string; data?: string }
    | undefined;
  if (inline?.data && typeof inline.data === "string" && inline.data.length >= 64) {
    return {
      mimeType: inline.mimeType || inline.mime_type || "image/png",
      dataBase64: inline.data,
    };
  }
  return null;
}

function extractParts(json: unknown): GeminiGenerateResult {
  const root = json as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: unknown[] };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const blockReason = root.promptFeedback?.blockReason;
  const candidates = root.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { text: "", images: [], blockReason };
  }

  const candidateFinishReason =
    typeof candidates[0]?.finishReason === "string"
      ? candidates[0].finishReason
      : undefined;

  const textChunks: string[] = [];
  const images: GeminiInlineImage[] = [];
  const seenImageData = new Set<string>();

  const firstParts = candidates[0]?.content?.parts;
  if (Array.isArray(firstParts)) {
    for (const part of firstParts) {
      if (!part || typeof part !== "object") continue;
      const o = part as Record<string, unknown>;
      if (typeof o.text === "string" && o.text) textChunks.push(o.text);
    }
  }

  for (const cand of candidates) {
    const parts = cand?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const img = extractInlineImageFromPart(part);
      if (img) {
        const key = img.dataBase64.slice(0, 160);
        if (!seenImageData.has(key)) {
          seenImageData.add(key);
          images.push(img);
        }
      }
    }
  }

  return {
    text: textChunks.join("\n").trim(),
    images,
    blockReason,
    candidateFinishReason,
  };
}

export async function geminiGenerateContent(params: {
  model: string;
  systemInstruction?: string;
  contents: Array<{ role: "user" | "model"; parts: ContentPart[] }>;
  generationConfig?: Record<string, unknown>;
  /** Grounding with Google Search — real-time retail/product facts (billable; see Gemini pricing). */
  tools?: Array<Record<string, unknown>>;
  /** Retry on transient HTTP errors (429, 503) with backoff — up to 5 attempts total. */
  retryTransientErrors?: boolean;
}): Promise<{ ok: true; json: unknown } | { ok: false; status: number; body: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, status: 500, body: "GEMINI_API_KEY missing" };
  }

  const url = `${GEMINI_API_BASE}/models/${params.model}:generateContent`;

  const body: Record<string, unknown> = {
    contents: params.contents.map((c) => ({
      role: c.role,
      parts: c.parts,
    })),
  };

  if (params.systemInstruction?.trim()) {
    body.systemInstruction = {
      parts: [{ text: params.systemInstruction.trim() }],
    };
  }

  if (params.generationConfig && Object.keys(params.generationConfig).length > 0) {
    body.generationConfig = params.generationConfig;
  }

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
  }

  const payload = JSON.stringify(body);
  const maxAttempts = params.retryTransientErrors ? 5 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && params.retryTransientErrors) {
      const bases = [0, 500, 1500, 3000, 5500];
      const base = bases[Math.min(attempt, bases.length - 1)] ?? 5500;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(Math.min(8000, base + jitter));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: payload,
    });

    const raw = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, status: res.status, body: raw.slice(0, 500) };
    }

    if (!res.ok) {
      const retryable =
        params.retryTransientErrors &&
        (res.status === 429 || res.status === 503) &&
        attempt < maxAttempts - 1;
      if (!retryable) {
        return { ok: false, status: res.status, body: raw.slice(0, 800) };
      }
      continue;
    }

    return { ok: true, json };
  }

  return { ok: false, status: 500, body: "unexpected retry exhaustion" };
}

/** Plain text reply (chat). */
export async function geminiTextChat(params: {
  systemInstruction: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
}): Promise<GeminiGenerateResult | { error: string }> {
  const model = defaultGeminiTextModel();
  const contents: Array<{ role: "user" | "model"; parts: ContentPart[] }> = [];

  for (const turn of params.history) {
    contents.push({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: params.message }],
  });

  const result = await geminiGenerateContent({
    model,
    systemInstruction: params.systemInstruction,
    contents,
  });

  if (!result.ok) {
    return {
      error: `Gemini error (${result.status}). ${result.body}`,
    };
  }

  return extractParts(result.json);
}

/** Multi-turn planner chat; last user turn may include images in \`parts\`. */
export async function geminiPlannerMultiTurn(params: {
  systemInstruction: string;
  contents: Array<{ role: "user" | "model"; parts: ContentPart[] }>;
}): Promise<GeminiGenerateResult | { error: string }> {
  const model = defaultGeminiTextModel();

  const result = await geminiGenerateContent({
    model,
    systemInstruction: params.systemInstruction,
    contents: params.contents,
    retryTransientErrors: true,
  });

  if (!result.ok) {
    return {
      error: `Gemini error (${result.status}). ${result.body}`,
    };
  }

  return extractParts(result.json);
}

/** Multimodal: text + optional reference images (planner uploads). */
export async function geminiPlannerTurn(params: {
  systemInstruction: string;
  userText: string;
  imageParts: ContentPart[];
}): Promise<GeminiGenerateResult | { error: string }> {
  const model = defaultGeminiTextModel();
  const parts: ContentPart[] = [{ text: params.userText }, ...params.imageParts];

  const result = await geminiGenerateContent({
    model,
    systemInstruction: params.systemInstruction,
    contents: [{ role: "user", parts }],
  });

  if (!result.ok) {
    return {
      error: `Gemini error (${result.status}). ${result.body}`,
    };
  }

  return extractParts(result.json);
}

const PLANNER_VISUAL_EXTRACTION_SYSTEM = `You are a data extraction tool. Read the conversation between a homeowner and a planning assistant (Alex) about interior finish carpentry: closets, shelving, built-ins, trim, wall storage, etc.

Output ONLY valid JSON with exactly these keys (no markdown fences, no commentary):
- "width": number or null — inches, primary horizontal run along the wall / opening when inferable
- "height": number or null — inches, vertical span (floor to unit top or ceiling zone)
- "depth": number or null — inches, front-to-back into the room or closet cavity
- "material": string or null — short finish/material vibe only (e.g. painted MDF, oak tone); NEVER dollar amounts or SKUs
- "style": string or null — short aesthetic label only (e.g. modern, traditional); NEVER fees or rates
- "designCategory": string or null — Phase 1 "North Star" install type only (e.g. "Built-in shelving", "TV wall", "Trim refresh"); NOT finishes or brands
- "scopeNotes": string or null — 1–6 sentences: primary use case, obstructions or removals, architecture cues from photos when discussed; **include explicit quantities** for any counted scope the homeowner stated that is **not** captured by shelfCount / drawerCount / closetRodCount (e.g. closet organizer sections or tower modules, mirror or picture panels, moulding runs or pieces, bathroom fixtures in scope, bookcase bays/columns, other repeated elements). Example tail: "Counts: 3 closet sections, 2 mirrors." NEVER prices or SKUs
- "floor": number or null — storey / finished floor level when stated (e.g. 1 main, 2 second floor); otherwise null
- "isCondo": boolean or null — true if condo, apartment, or strata/stacked dwelling rules/access clearly apply; false if detached house clearly indicated; otherwise null
- "shelfCount": integer or null — number of **horizontal** shelf boards/tiers the homeowner asked for (e.g. "3 shelves"); null if unknown
- "drawerCount": integer or null — number of drawers stated; null if unknown
- "closetRodCount": integer or null — hanging rods / closet bars / garment rods (e.g. "2 hanging bars", "double hang" = 2 rods, "triple hang" = 3); null if unknown
- "shelfVerticalSpacingIn": number or null — inches between shelf tiers when the homeowner stated vertical spacing (e.g. "14 inches between each shelf"); null if unknown or only overall unit height was given
- "shelfBoardSpanAlongWallIn": number or null — inches: maximum left-to-right extent of each shelf board / tier when the homeowner wants shorter shelves (e.g. "24 inch shelves", "not as long", "shelves only 2 feet wide"). Not the full wall run (use width for full run). If they said "deep" or "depth", use depth instead, not this field.

Rules:
- **Output inches as numbers** for width, height, depth, shelfVerticalSpacingIn, and shelfBoardSpanAlongWallIn. When the homeowner used **mm, cm, m, feet, or inches**, convert to inches (round to one decimal when helpful). Alex stays unit-agnostic in chat; this JSON is the **inch-normalized** snapshot for image scale.
- If a magnitude appears **with no unit** in the transcript and there is **no** follow-up clarifying whether it was inches, centimeters, etc., set the affected numeric fields to **null** — do **not** assume inches vs centimeters on bare numbers.
- Phrases like **about, approximately, around, roughly, ~, close to, give or take** still carry a real target — **do not omit** the measurement; use the stated number as the value (same as an exact statement unless they give an explicit range — then use the midpoint or the clearest single value).
- Use numbers only when explicitly stated or clearly inferable; otherwise null. Do not invent precise measurements.
- Map homeowner size language onto **width / height / depth** (inches) when they describe the overall run or unit: e.g. "8 foot span along the wall" → width 96; "about 2.4 m wide" → convert to inches for width; "84 inches tall" / "7 foot tall unit" → height in inches; "300 mm deep shelves" → depth in inches when it describes shelf or cabinet depth into the room or cavity.
- Put **only** tier-to-tier or "between shelves" vertical spacing into **shelfVerticalSpacingIn** (in inches after conversion), not the full unit height.
- Put **per-shelf horizontal board length** (shorter shelves, "24 inch shelves" meaning not wall-long) into **shelfBoardSpanAlongWallIn** when it is **not** clearly overall unit width/height/depth.
- Capture **explicit counts** from the transcript for shelves, drawers, and closet hanging rods/bars (including “double hang” / “triple hang” as rod counts when that’s what the homeowner means). For other countable install elements (closet organizer sections/towers, mirrors, pictures, moulding runs, bathroom fixtures, bookcase bays, etc.), put the counts into **scopeNotes** if they do not map cleanly onto shelfCount, drawerCount, or closetRodCount.
- If only one horizontal is given for a closet run, map it to width when it reads like a wall span.
- **Pricing isolation:** Do NOT put call-out fees, hourly labor rates, "$150", dollar figures, or "/hour" language into ANY field — omit pricing entirely from this JSON (those signals stay in other backend systems only, never echoed here).
`;

/** Extract structured fields for concept-image prompting (separate from Alex's chat persona). */
export async function geminiExtractPlannerVisualSpec(
  conversationTranscript: string,
): Promise<PlannerVisualSpec | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const text = conversationTranscript.trim().slice(-24_000);
  if (!text) return null;

  const result = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction: PLANNER_VISUAL_EXTRACTION_SYSTEM,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Conversation transcript:\n\n${text}\n\nReturn only the JSON object.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
    retryTransientErrors: true,
  });

  if (!result.ok) return null;

  const extracted = extractParts(result.json);
  const rawText = extracted.text.trim();
  if (!rawText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  return normalizeVisualSpec(parsed as Record<string, unknown>);
}

const SUBMIT_DESIGN_EXTRACTION_SYSTEM = `You are a data extraction tool for interior finish carpentry jobs (closets, built-ins, shelving, trim).

Output ONLY valid JSON (no markdown fences, no commentary) with exactly these keys:
- "width": number or null — inches
- "height": number or null — inches
- "depth": number or null — inches
- "material": string or null — finishes only (no prices)
- "style": string or null — aesthetic label / vibe only (no prices)
- "designCategory": string or null — Project North Star category (e.g. "TV wall mount", "Reach-in closet", "Crown and base trim package") — NOT material finishes
- "scopeNotes": string or null — 2–8 sentences capturing use case, budget-as-guardrail discussion (without dollar figures), visible obstructions (outlets/vents), trim/ceiling context, and removals ONLY if the homeowner discussed them; no SKUs or store names
- "floorLevel": number or null — finished floor / storey when inferable (1 = main)
- "dwellingType": string or null — short label (e.g. Condo, Townhouse, Detached)
- "hasElevator": boolean or null — building elevator clearly yes/no; null if unknown
- "baseLaborHoursEstimate": number or null — realistic baseline INSTALL labor hours for THIS scope BEFORE logistics buffers and BEFORE any 15% margin (typical range 0.5–24)

Rules:
- Numbers only when stated or clearly inferable; otherwise null.
- When the assistant explicitly confirmed specs with the homeowner (e.g. "So that's 3 shelves, each 12 inches..."), use THOSE confirmed numbers — they are the source of truth.
- Never put dollar amounts, SKUs, or hourly rates into material/style/designCategory/scopeNotes.
`;

function parseLaborHoursEstimate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(48, Math.max(0.25, value));
  }
  if (typeof value === "string") {
    const m = value.trim().match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) return Math.min(48, Math.max(0.25, n));
    }
  }
  return null;
}

function normalizeSubmitDesignExtract(
  parsed: Record<string, unknown>,
): PlannerSubmitDesignExtract {
  let hasElevator: boolean | null = null;
  if ("hasElevator" in parsed) {
    if (typeof parsed.hasElevator === "boolean") {
      hasElevator = parsed.hasElevator;
    } else {
      hasElevator = parseBooleanLoose(parsed.hasElevator);
    }
  }

  const floorLevel =
    parseFloorField(parsed.floorLevel) ?? parseFloorField(parsed.floor);

  let dwellingType: string | null = null;
  if (typeof parsed.dwellingType === "string") {
    const t = parsed.dwellingType.trim();
    dwellingType = t.length ? t.slice(0, 120) : null;
  }

  let material: string | null = null;
  let style: string | null = null;
  if (typeof parsed.material === "string") {
    const t = parsed.material.trim();
    material = t.length ? t.slice(0, 500) : null;
  }
  if (typeof parsed.style === "string") {
    const t = parsed.style.trim();
    style = t.length ? t.slice(0, 300) : null;
  }
  const scrubPricing = (s: string | null): string | null => {
    if (!s) return null;
    if (/\$\s*\d|hourly|\$\s*150\b|\b150\s*dollar|\d\s*\$\s*\/\s*hr|\b\/hr\b/i.test(s)) {
      return null;
    }
    return s;
  };
  material = scrubPricing(material);
  style = scrubPricing(style);

  let designCategory: string | null = null;
  if (typeof parsed.designCategory === "string") {
    const t = parsed.designCategory.trim();
    designCategory = t.length ? t.slice(0, 500) : null;
  }
  designCategory = scrubPricing(designCategory);

  let scopeNotes: string | null = null;
  if (typeof parsed.scopeNotes === "string") {
    const t = parsed.scopeNotes.trim();
    scopeNotes = t.length ? t.slice(0, 12000) : null;
  }
  scopeNotes = scrubPricing(scopeNotes);

  return {
    width: parseInchesField(parsed.width),
    height: parseInchesField(parsed.height),
    depth: parseInchesField(parsed.depth),
    material,
    style,
    designCategory,
    scopeNotes,
    floorLevel,
    dwellingType,
    hasElevator,
    baseLaborHoursEstimate: parseLaborHoursEstimate(parsed.baseLaborHoursEstimate),
  };
}

export async function geminiExtractPlannerSubmitDesign(
  conversationTranscript: string,
): Promise<PlannerSubmitDesignExtract | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const text = conversationTranscript.trim().slice(-24_000);
  if (!text) return null;

  const result = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction: SUBMIT_DESIGN_EXTRACTION_SYSTEM,
    contents: [
      {
        role: "user",
        parts: [{ text: `Conversation transcript:\n\n${text}\n\nReturn only the JSON object.` }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  if (!result.ok) return null;

  const extracted = extractParts(result.json);
  const rawText = extracted.text.trim();
  if (!rawText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  return normalizeSubmitDesignExtract(parsed as Record<string, unknown>);
}

export type GeminiShoppingListItem = {
  description: string;
  estimatedCad: number;
  qty?: number | null;
  notes?: string | null;
};

export type GeminiMaterialsEstimate = {
  items: GeminiShoppingListItem[];
  totalMaterialCad: number;
  grounded: boolean;
};

const MATERIALS_WITH_SEARCH_SYSTEM = `You estimate realistic CAD retail rough-order material costs for a residential finish-carpentry scope described by the homeowner.

Use Google Search grounding when it materially improves pricing realism for lumber, sheet goods, hardware, and finishing supplies in Canada.

Return ONLY valid JSON (no markdown fences) with exactly:
{
  "totalMaterialCad": number,
  "items": [ { "description": string, "estimatedCad": number, "qty": number|null, "notes": string|null } ],
  "groundingNotes": string
}

Rules:
- totalMaterialCad should match the sum of item estimatedCad within ~15%.
- Keep descriptions generic (no need for exact SKUs).
- If uncertain, round conservatively and explain briefly in groundingNotes.
`;

function parseMaterialsJson(raw: string): GeminiMaterialsEstimate | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const totalRaw = o.totalMaterialCad;
  let totalMaterialCad = 0;
  if (typeof totalRaw === "number" && Number.isFinite(totalRaw)) {
    totalMaterialCad = Math.max(0, totalRaw);
  }
  const itemsRaw = o.items;
  const items: GeminiShoppingListItem[] = [];
  if (Array.isArray(itemsRaw)) {
    for (const row of itemsRaw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const description =
        typeof r.description === "string" ? r.description.trim().slice(0, 400) : "";
      if (!description) continue;
      let estimatedCad = 0;
      if (typeof r.estimatedCad === "number" && Number.isFinite(r.estimatedCad)) {
        estimatedCad = Math.max(0, r.estimatedCad);
      }
      let qty: number | null = null;
      if (typeof r.qty === "number" && Number.isFinite(r.qty)) qty = r.qty;
      let notes: string | null = null;
      if (typeof r.notes === "string" && r.notes.trim()) {
        notes = r.notes.trim().slice(0, 400);
      }
      items.push({ description, estimatedCad, qty, notes });
    }
  }

  if (items.length === 0 && totalMaterialCad <= 0) return null;

  if (totalMaterialCad <= 0 && items.length > 0) {
    totalMaterialCad = items.reduce((s, i) => s + i.estimatedCad, 0);
  }

  return {
    items,
    totalMaterialCad: Math.max(0, Math.round(totalMaterialCad * 100) / 100),
    grounded: false,
  };
}

export async function geminiEstimateMaterialsShoppingList(params: {
  transcript: string;
  dimsSummary: string;
  dwellingLabel: string;
}): Promise<GeminiMaterialsEstimate> {
  const apiKey = getApiKey();
  const prompt = [
    "Homeowner transcript (trimmed):",
    params.transcript.trim().slice(-16_000),
    "",
    `Dwelling / context: ${params.dwellingLabel}`,
    `Envelope hint: ${params.dimsSummary}`,
    "",
    "Produce the JSON object now.",
  ].join("\n");

  if (!apiKey) {
    return {
      items: [
        {
          description: "Estimated sheet goods, lumber & hardware bundle (Gemini not configured)",
          estimatedCad: 400,
          qty: 1,
          notes: "Placeholder — set GEMINI_API_KEY for grounded estimates.",
        },
      ],
      totalMaterialCad: 400,
      grounded: false,
    };
  }

  const withSearch = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction: MATERIALS_WITH_SEARCH_SYSTEM,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
  });

  if (withSearch.ok) {
    const parts = extractParts(withSearch.json);
    const parsed = parseMaterialsJson(parts.text);
    if (parsed) {
      return { ...parsed, grounded: true };
    }
  }

  const plain = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction: MATERIALS_WITH_SEARCH_SYSTEM,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  if (plain.ok) {
    const parts = extractParts(plain.json);
    const parsed = parseMaterialsJson(parts.text);
    if (parsed) return parsed;
  }

  return {
    items: [
      {
        description: "Estimated materials bundle (parser fallback)",
        estimatedCad: 450,
        qty: 1,
        notes: "Automatic fallback estimate.",
      },
    ],
    totalMaterialCad: 450,
    grounded: false,
  };
}

const CREW_SIZE_SYSTEM = `You are a finish-carpentry estimator for Level Up Install (Toronto).

Given the homeowner's project description, dimensions, dwelling context, material list, and estimated man-hours, decide whether the install is a ONE-person or TWO-person job.

Choose TWO when any of these hold:
- Pieces are large, heavy, or awkward for one person to hold and fasten (wall units, wardrobes, murphy beds, long runs of shelving, pieces wider than ~8 ft / 96 in, tall units over ~7 ft).
- The transcript mentions items one person cannot safely lift or position alone.
- Estimated man-hours exceed ~16 (more than two full solo days — a pair finishes in reasonable calendar time).

Otherwise choose ONE.

Return ONLY valid JSON (no markdown fences):
{ "crewSize": 1 | 2, "reason": string }

Rules:
- "reason" is one short sentence naming the deciding factor, e.g. "12-ft wall unit needs two people to lift and level." or "Small scope, easily handled solo."
- Never return anything besides the JSON object.`;

/** AI crew-size recommendation: 1 = solo, 2 = two-person crew. Falls back to a heuristic. */
export async function geminiRecommendCrewSize(params: {
  transcript: string;
  dimsSummary: string;
  dwellingLabel: string;
  materialDescriptions: string[];
  estimatedManHours: number;
}): Promise<{ crewSize: 1 | 2; reason: string }> {
  const fallback = (): { crewSize: 1 | 2; reason: string } => {
    const hay = `${params.transcript}\n${params.materialDescriptions.join("\n")}`.toLowerCase();
    const bigPiece =
      /murphy|wardrobe|wall unit|wall-unit|vanity|12\s*ft|10\s*ft|96\s*in|8\s*ft/.test(hay);
    const wide = /(\d{2,3})\s*in/.test(params.dimsSummary) &&
      Math.max(
        ...Array.from(params.dimsSummary.matchAll(/(\d{2,3})\s*in/g)).map((m) =>
          parseInt(m[1], 10),
        ),
        0,
      ) > 96;
    if (bigPiece || wide || params.estimatedManHours >= 16) {
      return {
        crewSize: 2,
        reason: "Large/heavy pieces or long duration — safer and faster with two installers.",
      };
    }
    return { crewSize: 1, reason: "Small scope, easily handled solo." };
  };

  if (!isGeminiConfigured()) return fallback();

  const prompt = [
    "Homeowner transcript (trimmed):",
    params.transcript.trim().slice(-8000),
    "",
    `Dwelling / context: ${params.dwellingLabel}`,
    `Envelope hint: ${params.dimsSummary}`,
    `Estimated man-hours: ${params.estimatedManHours.toFixed(1)}`,
    "Materials:",
    ...params.materialDescriptions.slice(0, 30).map((d) => `- ${d}`),
    "",
    "Produce the JSON object now.",
  ].join("\n");

  try {
    const res = await geminiGenerateContent({
      model: defaultGeminiTextModel(),
      systemInstruction: CREW_SIZE_SYSTEM,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 256, temperature: 0.2 },
    });
    if (!res.ok) return fallback();
    const { text } = extractParts(res.json);
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(stripped) as { crewSize?: unknown; reason?: unknown };
    const crewSize = parsed.crewSize === 2 ? 2 : 1;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 200)
        : fallback().reason;
    return { crewSize, reason };
  } catch {
    return fallback();
  }
}

const SHOP_PACKET_SYSTEM = `You are a millwork drafter producing a shop drawing packet for a finish-carpentry installer.

You receive:
- An AI-generated concept rendering of the approved design (design intent only — NOT to scale).
- REAL site measurements in inches (wall width/height, ceiling height). These are the source of truth for every dimension you emit.
- The homeowner transcript and material summary for context.

Produce a dimensioned front-elevation plan the installer can build from. Every element needs exact placement:
- Position each element by its BOTTOM edge height above finished floor (bottomAffIn) and its LEFT edge distance from the LEFT CORNER of the wall as you face it (leftFromDatumIn).
- All dimensions in whole or half inches.

Return ONLY valid JSON (no markdown fences):
{
  "datumDescription": string,
  "elements": [
    {
      "label": string,
      "widthIn": number, "heightIn": number, "depthIn": number,
      "bottomAffIn": number,
      "leftFromDatumIn": number,
      "horizontalRef": string,
      "notes": string
    }
  ],
  "installSteps": [ string ],
  "warnings": [ string ]
}

Rules:
- "datumDescription" states the reference system, e.g. "All heights are inches above finished floor (AFF). Horizontal dimensions run from the left corner of the wall, facing it."
- Elements must fit inside the measured wall (leftFromDatumIn + widthIn <= wallWidthIn; bottomAffIn + heightIn <= wallHeightIn). If the concept doesn't fit, shrink or re-center it and say so in warnings.
- "horizontalRef" is the human-readable reference, e.g. "centered on wall" or "16 in from left corner".
- "installSteps" is a numbered install sequence: layout/marking, then mounting order, then trim/finish.
- "warnings" always includes "Verify all dimensions on site before cutting." plus anything that looked uncertain (e.g. "Out-of-plumb walls assumed — scribe on site.").
- Keep labels short ("Shelf A", "Left tower", "Mantel"). Max 24 elements.`;

/** Generate a dimensioned shop packet from the approved rendering + real site measurements. */
export async function geminiGenerateShopPacket(params: {
  renderingMimeType: string;
  renderingDataBase64: string;
  wallWidthIn: number;
  wallHeightIn: number;
  ceilingHeightIn: number;
  measurementNotes: string;
  transcript: string;
  materialDescriptions: string[];
}): Promise<{
  datumDescription: string;
  elements: Array<{
    label: string;
    widthIn: number;
    heightIn: number;
    depthIn: number;
    bottomAffIn: number;
    leftFromDatumIn: number;
    horizontalRef: string;
    notes: string;
  }>;
  installSteps: string[];
  warnings: string[];
} | null> {
  if (!isGeminiConfigured()) return null;

  const prompt = [
    "REAL SITE MEASUREMENTS (inches — source of truth):",
    `Wall width: ${params.wallWidthIn} in`,
    `Wall height: ${params.wallHeightIn} in`,
    `Ceiling height: ${params.ceilingHeightIn} in`,
    params.measurementNotes.trim() ? `Measurement notes: ${params.measurementNotes.trim()}` : "",
    "",
    "Homeowner transcript (trimmed):",
    params.transcript.trim().slice(-8000),
    "",
    "Materials:",
    ...params.materialDescriptions.slice(0, 30).map((d) => `- ${d}`),
    "",
    "Produce the JSON object now. Base every dimension on the real measurements, using the rendering only for design intent (what goes where).",
  ].join("\n");

  try {
    const res = await geminiGenerateContent({
      model: defaultGeminiTextModel(),
      systemInstruction: SHOP_PACKET_SYSTEM,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: params.renderingMimeType,
                data: params.renderingDataBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.2,
        // Structured JSON drafting: no chain-of-thought needed. Thinking tokens
        // count against maxOutputTokens and were truncating the JSON mid-stream.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    if (!res.ok) {
      console.error("[shop-packet] gemini call failed", res.status, res.body.slice(0, 300));
      return null;
    }
    const { text } = extractParts(res.json);
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (!stripped) {
      console.error("[shop-packet] empty text response");
      return null;
    }
    let parsed: {
      datumDescription?: unknown;
      elements?: unknown;
      installSteps?: unknown;
      warnings?: unknown;
    };
    try {
      parsed = JSON.parse(stripped) as {
        datumDescription?: unknown;
        elements?: unknown;
        installSteps?: unknown;
        warnings?: unknown;
      };
    } catch (parseErr) {
      console.error("[shop-packet] JSON parse failed", String(parseErr).slice(0, 120));
      return null;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.elements)) {
      console.error("[shop-packet] no elements array in response");
      return null;
    }

    const num = (v: unknown, fallbackNum = 0) =>
      typeof v === "number" && Number.isFinite(v) ? Math.round(v * 2) / 2 : fallbackNum;
    const elements = (parsed.elements as Record<string, unknown>[])
      .filter((e) => e && typeof e === "object")
      .slice(0, 24)
      .map((e) => {
        const widthIn = Math.max(0.5, num(e.widthIn, 12));
        const heightIn = Math.max(0.5, num(e.heightIn, 12));
        return {
          label: typeof e.label === "string" && e.label.trim() ? e.label.trim().slice(0, 60) : "Element",
          widthIn,
          heightIn,
          depthIn: Math.max(0.5, num(e.depthIn, 12)),
          bottomAffIn: Math.max(0, num(e.bottomAffIn, 0)),
          leftFromDatumIn: Math.max(
            0,
            Math.min(num(e.leftFromDatumIn, 0), Math.max(0, params.wallWidthIn - widthIn)),
          ),
          horizontalRef:
            typeof e.horizontalRef === "string" && e.horizontalRef.trim()
              ? e.horizontalRef.trim().slice(0, 120)
              : "",
          notes: typeof e.notes === "string" ? e.notes.trim().slice(0, 300) : "",
        };
      })
      .filter((e) => e.label.length > 0);

    const strArr = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, 500)).slice(0, 30)
        : [];
    const warnings = strArr(parsed.warnings);
    if (!warnings.some((w) => /verify/i.test(w))) {
      warnings.unshift("Verify all dimensions on site before cutting.");
    }

    return {
      datumDescription:
        typeof parsed.datumDescription === "string" && parsed.datumDescription.trim()
          ? parsed.datumDescription.trim().slice(0, 500)
          : "All heights are inches above finished floor (AFF). Horizontal dimensions run from the left corner of the wall, facing it.",
      elements,
      installSteps: strArr(parsed.installSteps),
      warnings,
    };
  } catch {
    return null;
  }
}

/** Reference mime must be image/* supported by Gemini image stack. */
export async function geminiGenerateInstallBlueprint(params: {
  referenceMimeType: string;
  referenceDataBase64: string;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  materialHint?: string | null;
  styleHint?: string | null;
}): Promise<GeminiGenerateResult | { error: string }> {
  const model = defaultGeminiImageModel();

  const hints = [
    params.materialHint?.trim() ? `Materials: ${params.materialHint.trim()}` : "",
    params.styleHint?.trim() ? `Style: ${params.styleHint.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Produce ONE technical installation drawing for the built-in shown in the attached homeowner/agreed render reference.

Requirements:
- Pure black linework on white background (blueprint / permit-style). NO color fills. NO photorealistic shading.
- Orthographic or simple elevation view that an installer can follow.
- Clearly annotate overall WIDTH × HEIGHT × DEPTH in inches on the drawing: ${params.widthIn}" W × ${params.heightIn}" H × ${params.depthIn}" D.
- Show principal openings, partitions, and shelf zones where inferable from the reference — generic labels only (no brands).
${hints ? `\n${hints}` : ""}`;

  const result = await geminiGenerateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: params.referenceMimeType,
              data: params.referenceDataBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  if (!result.ok) {
    return {
      error: `Gemini blueprint error (${result.status}). ${result.body}`,
    };
  }

  return extractParts(result.json);
}

/** Builds the exact text block sent to the image model (for admin CRM audit). */
export function buildGeminiConceptImagePromptText(params: {
  promptContext: string;
  userGoal: string;
  extractedVisualDirective?: string;
  structuralGuideDirective?: string;
  visualMode?: ImageRenderDirectiveMode;
  geometryRefinement?: boolean;
}): { imageModel: string; fullPromptText: string } {
  const imageModel = defaultGeminiImageModel();
  const isRefinement = params.visualMode === "refinement-delta";
  const isGeometryRefinement = Boolean(params.geometryRefinement && isRefinement);

  const extractionBlock = params.extractedVisualDirective?.trim()
    ? `

---
Layout & scale (${isRefinement ? "refinement lock" : "first render"}):
${params.extractedVisualDirective.trim()}
`
    : "";

  const structuralBlock = params.structuralGuideDirective?.trim()
    ? `

---
Structural reference:
${params.structuralGuideDirective.trim()}
`
    : "";

  const modeSuffix = isRefinement
    ? `\n\n${LEVEL_UP_IMAGE_REFINEMENT_SUFFIX}${
        isGeometryRefinement ? `\n${LEVEL_UP_IMAGE_GEOMETRY_REFINEMENT_SUFFIX}` : ""
      }`
    : "";

  const fullPrompt = `${LEVEL_UP_IMAGE_RENDER_SYSTEM}${modeSuffix}

Context:
${params.promptContext.slice(0, isRefinement ? 4000 : 8000)}${extractionBlock}

Visualization request:
${params.userGoal.slice(0, isRefinement ? 2500 : 5000)}${structuralBlock}`;

  return {
    imageModel,
    fullPromptText: fullPrompt.slice(0, 24_000),
  };
}

/** Image-capable model: TEXT + IMAGE modalities. */
export async function geminiGenerateConceptImage(params: {
  promptContext: string;
  /** Short user-facing goal line */
  userGoal: string;
  /** Space photos from the homeowner — improves sketch grounding when present. */
  referenceImageParts?: ContentPart[];
  /** Post-extraction directive: dimensions, materials, scale injection (image model only). */
  extractedVisualDirective?: string;
  /**
   * Optional structural reference block (legacy; planner no longer attaches blueprint images).
   */
  structuralGuideDirective?: string;
  visualMode?: ImageRenderDirectiveMode;
  geometryRefinement?: boolean;
}): Promise<GeminiGenerateResult | { error: string }> {
  const model = defaultGeminiImageModel();
  const { fullPromptText: fullPrompt } = buildGeminiConceptImagePromptText({
    promptContext: params.promptContext,
    userGoal: params.userGoal,
    extractedVisualDirective: params.extractedVisualDirective,
    structuralGuideDirective: params.structuralGuideDirective,
    visualMode: params.visualMode,
    geometryRefinement: params.geometryRefinement,
  });

  // Photo first, then the request — mirrors how the Gemini App works
  // (upload photo, then type). The model edits the photo that precedes the text.
  const parts: ContentPart[] = [
    ...(params.referenceImageParts ?? []),
    { text: fullPrompt },
  ];

  const result = await geminiGenerateContent({
    model,
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
    retryTransientErrors: true,
  });

  if (!result.ok) {
    return {
      error: `Gemini image model error (${result.status}). ${result.body}`,
    };
  }

  return extractParts(result.json);
}

/**
 * Vision accuracy check: count shelf boards in a generated concept image.
 * Diffusion models hallucinate counts ("exactly 4 shelves" renders 3), so
 * after a render we verify with a cheap text-model vision call and let the
 * caller retry with a correction when the count is wrong. Returns the
 * observed count, or null when the model can't answer / the call fails —
 * a null never blocks delivery on its own.
 */
export async function geminiCountShelvesInImage(params: {
  imageMimeType: string;
  imageDataBase64: string;
}): Promise<number | null> {
  if (!isGeminiConfigured()) return null;
  const res = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction:
      "You inspect an AI-generated interior concept image. Count ONLY the horizontal shelf boards that are part of the proposed finish-carpentry built-in/shelving (ignore countertops, mantels, windowsills, and background furniture). Reply with exactly one integer and nothing else.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "How many horizontal shelf boards are part of the proposed built-in shelving in this image? Reply with exactly one integer.",
          },
          {
            inline_data: {
              mime_type: params.imageMimeType,
              data: params.imageDataBase64,
            },
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 16, temperature: 0.1 },
  });
  if (!res.ok) return null;
  const { text } = extractParts(res.json);
  const m = text.trim().match(/(\d{1,2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Structured millwork layout extracted from a concept image.
 * Used to ground shop-drawing elevations in what was actually rendered,
 * not just what the chat transcript mentioned.
 */
export type ConceptMillworkStructure = {
  /** Vertical bays (left to right), x0/x1 as fractions of the millwork width. */
  bays: { x0: number; x1: number; shelves: number }[];
  /** Base cabinets below the open shelving (doors/drawer fronts). */
  baseCabinets: { present: boolean; doors: number; drawers: number };
  /** Hanging rods visible. */
  rods: number;
  /** Freestanding drawer bank fronts visible. */
  drawers: number;
  /** Shoe cubby rows visible. */
  cubbyRows: number;
};

/**
 * Vision pass over the rendered concept image: extract the actual millwork
 * structure (bays, per-bay shelf counts, base cabinets, rods) so the SVG
 * elevation draws what the concept shows. Returns null on any failure —
 * callers fall back to transcript-harvested zones.
 */
export async function geminiExtractMillworkStructure(params: {
  imageMimeType: string;
  imageDataBase64: string;
}): Promise<ConceptMillworkStructure | null> {
  if (!isGeminiConfigured()) return null;
  const res = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction:
      "You inspect an AI-generated interior concept image showing proposed finish-carpentry millwork (built-in shelving, bookcases, closet systems, floating shelves). " +
      "Analyze ONLY the proposed millwork (ignore the original room, furniture, and decor). " +
      "Reply with exactly one JSON object and nothing else, using this schema: " +
      '{"bays":[{"x0":0,"x1":0.25,"shelves":4}],"baseCabinets":{"present":true,"doors":4,"drawers":0},"rods":0,"drawers":0,"cubbyRows":0}. ' +
      "Rules: bays are vertical divisions of the millwork left to right; x0/x1 are fractions of the total millwork width (0 to 1); " +
      "shelves counts horizontal shelf boards per bay (0 if the bay has none, e.g. a hanging section); " +
      "baseCabinets.present is true when there are lower cabinets with door/drawer fronts below open shelving; " +
      "count door and drawer fronts separately. " +
      "For simple floating shelves with no vertical divisions, return a single bay spanning 0 to 1. " +
      "For closets: hanging sections are bays with shelves:0; count rods, drawer fronts, and cubby rows. " +
      "If no millwork is visible, return empty bays and all zeros.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Extract the millwork structure from this concept image as JSON per the schema. Reply with exactly one JSON object and nothing else.",
          },
          {
            inline_data: {
              mime_type: params.imageMimeType,
              data: params.imageDataBase64,
            },
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
  });
  if (!res.ok) return null;
  const { text } = extractParts(res.json);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    const bays = Array.isArray(parsed.bays)
      ? parsed.bays
          .map((b: { x0?: number; x1?: number; shelves?: number }) => ({
            x0: Math.max(0, Math.min(1, Number(b.x0) || 0)),
            x1: Math.max(0, Math.min(1, Number(b.x1) || 1)),
            shelves: Math.max(0, Math.min(20, Math.round(Number(b.shelves) || 0))),
          }))
          .filter((b: { x0: number; x1: number }) => b.x1 > b.x0)
      : [];
    const bc = parsed.baseCabinets ?? {};
    return {
      bays,
      baseCabinets: {
        present: !!bc.present,
        doors: Math.max(0, Math.min(20, Math.round(Number(bc.doors) || 0))),
        drawers: Math.max(0, Math.min(20, Math.round(Number(bc.drawers) || 0))),
      },
      rods: Math.max(0, Math.min(10, Math.round(Number(parsed.rods) || 0))),
      drawers: Math.max(0, Math.min(20, Math.round(Number(parsed.drawers) || 0))),
      cubbyRows: Math.max(0, Math.min(10, Math.round(Number(parsed.cubbyRows) || 0))),
    };
  } catch {
    return null;
  }
}

/**
 * Vision pass over a 3D-scan floor plan export (Polycam etc.): extract the
 * room's real wall dimensions so the planner spec uses measured values
 * instead of assumed ones. Returns the raw parsed JSON (validate with
 * normalizeScanDimensions); null on any failure.
 */
export async function geminiExtractScanDimensions(params: {
  imageMimeType: string;
  imageDataBase64: string;
  dimensionPrompt: string;
}): Promise<unknown | null> {
  if (!isGeminiConfigured()) return null;
  const res = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction:
      "You inspect a floor plan image exported from a 3D room scan. " +
      "Extract dimensions exactly as shown — never guess. " +
      "Reply with exactly one JSON object and nothing else.",
    contents: [
      {
        role: "user",
        parts: [
          { text: params.dimensionPrompt },
          {
            inline_data: {
              mime_type: params.imageMimeType,
              data: params.imageDataBase64,
            },
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
  });
  if (!res.ok) return null;
  const { text } = extractParts(res.json);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Vision check: is the candidate interior photo essentially the same shot as the reference?
 * Used for ambiguous near-duplicate space uploads (CRM / portal dedupe).
 */
export async function geminiConfirmDuplicateSpacePhoto(params: {
  candidateJpegBase64: string;
  referenceJpegBase64: string;
}): Promise<boolean | null> {
  if (!isGeminiConfigured()) return null;
  const model = defaultGeminiTextModel();
  const res = await geminiGenerateContent({
    model,
    systemInstruction:
      "You compare two interior photos. Decide if they show the same scene and framing (re-upload / duplicate), not merely the same room from a different angle. Reply with exactly one word: DUPLICATE or DISTINCT.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Image 1 is the reference. Image 2 is the new upload. Are they duplicates (same photo or trivial re-crop/re-save)?",
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: params.referenceJpegBase64,
            },
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: params.candidateJpegBase64,
            },
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 16, temperature: 0.1 },
    retryTransientErrors: true,
  });
  if (!res.ok) return null;
  const { text } = extractParts(res.json);
  const t = text.trim().toUpperCase();
  if (t.includes("DUPLICATE")) return true;
  if (t.includes("DISTINCT")) return false;
  return null;
}
