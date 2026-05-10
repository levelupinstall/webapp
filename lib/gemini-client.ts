import {
  LEVEL_UP_IMAGE_GENERATION_SUFFIX,
  LEVEL_UP_LEAD_COORDINATOR_PROMPT,
} from "@/lib/level-up-gemini-persona";
import {
  normalizeVisualSpec,
  parseBooleanLoose,
  parseFloorField,
  parseInchesField,
  type PlannerVisualSpec,
} from "@/lib/planner-visual-spec";
import type { PlannerSubmitDesignExtract } from "@/lib/planner-submit-design-types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiInlineImage = {
  mimeType: string;
  dataBase64: string;
};

export type GeminiGenerateResult = {
  text: string;
  images: GeminiInlineImage[];
  blockReason?: string;
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
    "gemini-2.5-flash-image"
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
  };
}

export async function geminiGenerateContent(params: {
  model: string;
  systemInstruction?: string;
  contents: Array<{ role: "user" | "model"; parts: ContentPart[] }>;
  generationConfig?: Record<string, unknown>;
  /** Grounding with Google Search — real-time retail/product facts (billable; see Gemini pricing). */
  tools?: Array<Record<string, unknown>>;
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, status: res.status, body: raw.slice(0, 500) };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, body: raw.slice(0, 800) };
  }

  return { ok: true, json };
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
- "floor": number or null — storey / finished floor level when stated (e.g. 1 main, 2 second floor); otherwise null
- "isCondo": boolean or null — true if condo, apartment, or strata/stacked dwelling rules/access clearly apply; false if detached house clearly indicated; otherwise null

Rules:
- Use numbers only when explicitly stated or clearly inferable; otherwise null. Do not invent precise measurements.
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
- "style": string or null — aesthetic label only (no prices)
- "floorLevel": number or null — finished floor / storey when inferable (1 = main)
- "dwellingType": string or null — short label (e.g. Condo, Townhouse, Detached)
- "hasElevator": boolean or null — building elevator clearly yes/no; null if unknown
- "baseLaborHoursEstimate": number or null — realistic baseline INSTALL labor hours for THIS scope BEFORE logistics buffers and BEFORE any 15% margin (typical range 0.5–24)

Rules:
- Numbers only when stated or clearly inferable; otherwise null.
- Never put dollar amounts, SKUs, or hourly rates into material/style.
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

  return {
    width: parseInchesField(parsed.width),
    height: parseInchesField(parsed.height),
    depth: parseInchesField(parsed.depth),
    material,
    style,
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

/** Image-capable model: TEXT + IMAGE modalities. */
export async function geminiGenerateConceptImage(params: {
  promptContext: string;
  /** Short user-facing goal line */
  userGoal: string;
  /** Space photos from the homeowner — improves sketch grounding when present. */
  referenceImageParts?: ContentPart[];
  /** Post-extraction directive: dimensions, materials, scale injection (image model only). */
  extractedVisualDirective?: string;
}): Promise<GeminiGenerateResult | { error: string }> {
  const model = defaultGeminiImageModel();

  const extractionBlock = params.extractedVisualDirective?.trim()
    ? `

---
Extracted parameters & mandatory rendering scale (follow strictly; generic finishes only):
${params.extractedVisualDirective.trim()}
`
    : "";

  const fullPrompt = `${LEVEL_UP_LEAD_COORDINATOR_PROMPT}

${LEVEL_UP_IMAGE_GENERATION_SUFFIX}

Project / homeowner context:
${params.promptContext.slice(0, 12000)}${extractionBlock}

Specific visualization request:
${params.userGoal.slice(0, 4000)}`;

  const parts: ContentPart[] = [
    { text: fullPrompt },
    ...(params.referenceImageParts ?? []),
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
  });

  if (!result.ok) {
    return {
      error: `Gemini image model error (${result.status}). ${result.body}`,
    };
  }

  return extractParts(result.json);
}
