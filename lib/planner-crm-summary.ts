import {
  defaultGeminiTextModel,
  geminiGenerateContent,
  isGeminiConfigured,
} from "@/lib/gemini-client";

const MAX_TURNS = 28;
const MAX_SNIPPET = 4000;

function extractGeminiText(json: unknown): string {
  const root = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = root.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("\n").trim();
}

export type CrmSummaryTurnHint = {
  createdAt: string;
  intakeSummary?: string;
  photoHintsSummary?: string;
  hadConceptImage?: boolean;
  renderError?: string;
};

/**
 * Rolling admin-facing digest of planner turns (goals, dimensions, constraints).
 * Best-effort: returns null if Gemini is unavailable or the call fails.
 */
export async function recomputeAiPlannerCrmSummary(params: {
  previousSummary: string;
  turnsNewestFirst: Array<{
    createdAt: string;
    prompt: string;
    reply: string;
    hint?: CrmSummaryTurnHint;
  }>;
}): Promise<string | null> {
  if (!isGeminiConfigured()) return null;
  const slice = params.turnsNewestFirst.slice(0, MAX_TURNS);
  if (slice.length === 0) return null;

  const block = slice
    .map((t, i) => {
      const p = t.prompt.slice(0, MAX_SNIPPET);
      const r = t.reply.slice(0, MAX_SNIPPET);
      const hint = t.hint;
      const hintLines: string[] = [];
      if (hint?.intakeSummary) hintLines.push(`Platform: ${hint.intakeSummary}`);
      if (hint?.photoHintsSummary) hintLines.push(`Photo hints: ${hint.photoHintsSummary}`);
      if (hint?.hadConceptImage) hintLines.push("Concept image: delivered this turn");
      if (hint?.renderError) hintLines.push(`Render note: ${hint.renderError}`);
      const hintBlock =
        hintLines.length > 0 ? `\n\nTurn metadata:\n${hintLines.join("\n")}` : "";
      return `--- Turn ${i + 1} (${t.createdAt}) ---\nHomeowner:\n${p}\n\nAssistant:\n${r}${hintBlock}`;
    })
    .join("\n\n");

  const prev = params.previousSummary.trim().slice(0, 8000);
  const res = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction: `You write detailed CRM notes for a finish-carpentry sales team reviewing an AI planner chat.

Output **markdown** with these sections (use ## headers). Omit a section only if nothing is knowable; never invent facts.

## Project and budget
- Install type / room / scope (closet, shelving, media wall, trim, etc.)
- Budget range or guardrails as stated (no invented dollar totals)

## Style and materials
- Aesthetic direction and finish vibe (no brands or stores)

## Dimensions and counts
- Width × height × depth (with units as the homeowner stated them)
- Shelf, rod, drawer, or other counts when stated
- Ambiguities or unit clarifications still open

## Photos and site notes
- What photos showed or what vision hints suggested (obstructions, ceiling, trim) — not pixel-measured dimensions

## Conversation arc
- Chronological story: what was asked, what the homeowner answered, mood shifts
- Whether a concept image was shown or a render failed (use turn metadata when present)

## Open items for the rep
- Missing phone, callback, condo rules, timeline, risks, or unhappy feedback

Rules:
- Be specific and factual; quote key numbers and phrases when helpful.
- Do not invent measurements, prices, or product names not in the transcript.
- If the thread is thin, say so briefly under Open items.`,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Prior CRM digest (merge and refresh; drop stale contradictions if the latest turn overrides):\n${prev || "(none)"}\n\n--- Latest planner turns (newest block first) ---\n\n${block}`,
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 2400, temperature: 0.2 },
    retryTransientErrors: true,
  });
  if (!res.ok) return null;
  const text = extractGeminiText(res.json);
  return text.length > 0 ? text.slice(0, 24_000) : null;
}
