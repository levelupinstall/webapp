import {
  LEVEL_UP_IMAGE_GENERATION_SUFFIX,
  LEVEL_UP_LEAD_COORDINATOR_PROMPT,
} from "@/lib/level-up-gemini-persona";

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

function extractParts(json: unknown): GeminiGenerateResult {
  const root = json as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: unknown[] };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const blockReason = root.promptFeedback?.blockReason;
  const parts = root.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return { text: "", images: [], blockReason };
  }

  const textChunks: string[] = [];
  const images: GeminiInlineImage[] = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const o = part as Record<string, unknown>;
    if (typeof o.text === "string" && o.text) textChunks.push(o.text);

    const inline = (o.inlineData ?? o.inline_data) as
      | { mimeType?: string; mime_type?: string; data?: string }
      | undefined;
    if (inline?.data && typeof inline.data === "string") {
      images.push({
        mimeType: inline.mimeType || inline.mime_type || "image/png",
        dataBase64: inline.data,
      });
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

/** Image-capable model: TEXT + IMAGE modalities. */
export async function geminiGenerateConceptImage(params: {
  promptContext: string;
  /** Short user-facing goal line */
  userGoal: string;
}): Promise<GeminiGenerateResult | { error: string }> {
  const model = defaultGeminiImageModel();

  const fullPrompt = `${LEVEL_UP_LEAD_COORDINATOR_PROMPT}

${LEVEL_UP_IMAGE_GENERATION_SUFFIX}

Project / homeowner context:
${params.promptContext.slice(0, 12000)}

Specific visualization request:
${params.userGoal.slice(0, 4000)}`;

  const result = await geminiGenerateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ text: fullPrompt }],
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
