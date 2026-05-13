import {
  defaultGeminiTextModel,
  geminiGenerateContent,
  isGeminiConfigured,
} from "@/lib/gemini-client";

export type PlannerRoomPhotoHints = {
  visibleNotes: string[];
  uncertainAreas: string[];
  suggestedMeasurementQuestions: string[];
};

type InlineImagePart = {
  inline_data: { mime_type: string; data: string };
};

function extractModelText(json: unknown): string {
  const root = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = root.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("\n").trim();
}

function parseHintsJson(text: string): PlannerRoomPhotoHints | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const asStrArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim().slice(0, 500))
      .slice(0, 12);
  };
  const visibleNotes = asStrArray(o.visibleNotes);
  const uncertainAreas = asStrArray(o.uncertainAreas);
  const suggestedMeasurementQuestions = asStrArray(o.suggestedMeasurementQuestions);
  if (
    visibleNotes.length === 0 &&
    uncertainAreas.length === 0 &&
    suggestedMeasurementQuestions.length === 0
  ) {
    return null;
  }
  return { visibleNotes, uncertainAreas, suggestedMeasurementQuestions };
}

/**
 * Vision pass on **this turn's** space photos: soft layout cues only (no invented inch/cm from pixels).
 * Used to steer Alex's questions and to append context for W×H×D JSON extraction + blueprint heuristics.
 */
export async function extractPlannerRoomPhotoHints(params: {
  imageParts: InlineImagePart[];
  lastUserMessage?: string;
}): Promise<PlannerRoomPhotoHints | null> {
  if (!isGeminiConfigured()) return null;
  const parts = params.imageParts.slice(0, 3);
  if (parts.length === 0) return null;

  const userNote = params.lastUserMessage?.trim().slice(0, 2000) || "(no text with upload)";

  const result = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction: `You are a finish-carpentry site survey assistant looking at homeowner **interior photos**.

Return **only** valid JSON (no markdown, no commentary) with exactly these keys:
- "visibleNotes": string[] — short factual bullets (max 10) about what you **see**: wall zones, openings, ceiling line, obvious trim, large furniture, apparent wall color, cable clutter zones, **visible** outlets/switches/vents, door swings, etc. Only describe what is reasonably visible.
- "uncertainAreas": string[] — max 8 bullets: what **cannot** be trusted from pixels alone (true wall width, ceiling height, shelf span, depth into room, outlet heights, etc.).
- "suggestedMeasurementQuestions": string[] — max 6 **specific** questions the installer should ask next to get **tape-measured** numbers (always ask for **units**). Tie questions to what the photo suggests (e.g. "What is the clear wall width between the door casing and the corner?"). If shelving or built-ins are in scope, prefer **one compound question** that asks together for **span along the wall (width/length)**, **vertical height**, and **shelf projection (depth)** — not depth alone.

Rules:
- **Never** output numeric inch/cm/mm values for room dimensions — photos are not calibrated.
- Do not claim certainty about stud spacing, code, or hidden structure.
- If the image is not an interior room, say so in visibleNotes and keep other arrays minimal.`,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Latest homeowner message:\n${userNote}\n\nAnalyze the attached interior photo(s) and return the JSON object.`,
          },
          ...parts,
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
    retryTransientErrors: true,
  });

  if (!result.ok) return null;
  const raw = extractModelText(result.json);
  if (!raw) return null;
  return parseHintsJson(raw);
}

/** Injected into Alex system instruction (markdown, bounded). */
export function formatPlannerPhotoHintsForSystemInstruction(h: PlannerRoomPhotoHints): string {
  const lines: string[] = [];
  if (h.visibleNotes.length) {
    lines.push("**Visible in the latest upload(s)**");
    for (const n of h.visibleNotes) lines.push(`- ${n}`);
  }
  if (h.uncertainAreas.length) {
    lines.push("\n**Not reliable from photos alone**");
    for (const n of h.uncertainAreas) lines.push(`- ${n}`);
  }
  if (h.suggestedMeasurementQuestions.length) {
    lines.push("\n**Ask the homeowner (with units)**");
    for (const q of h.suggestedMeasurementQuestions) lines.push(`- ${q}`);
  }
  return lines.join("\n").trim().slice(0, 6000);
}

/** Appended to extraction / harvest transcript so JSON spec + blueprint heuristics see photo context. */
export function formatPlannerPhotoHintsForTranscriptAppendix(h: PlannerRoomPhotoHints): string {
  const chunks: string[] = [];
  if (h.visibleNotes.length) {
    chunks.push(`Visible: ${h.visibleNotes.join(" | ")}`);
  }
  if (h.uncertainAreas.length) {
    chunks.push(`Uncertain from photo: ${h.uncertainAreas.join(" | ")}`);
  }
  if (h.suggestedMeasurementQuestions.length) {
    chunks.push(`Measure next: ${h.suggestedMeasurementQuestions.join(" | ")}`);
  }
  return chunks.join("\n").trim().slice(0, 4000);
}
