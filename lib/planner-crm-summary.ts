import {
  defaultGeminiTextModel,
  geminiGenerateContent,
  isGeminiConfigured,
} from "@/lib/gemini-client";

const MAX_TURNS = 24;
const MAX_SNIPPET = 3500;

function extractGeminiText(json: unknown): string {
  const root = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = root.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("\n").trim();
}

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
  }>;
}): Promise<string | null> {
  if (!isGeminiConfigured()) return null;
  const slice = params.turnsNewestFirst.slice(0, MAX_TURNS);
  if (slice.length === 0) return null;

  const block = slice
    .map((t, i) => {
      const p = t.prompt.slice(0, MAX_SNIPPET);
      const r = t.reply.slice(0, MAX_SNIPPET);
      return `--- Turn ${i + 1} (${t.createdAt}) ---\nHomeowner:\n${p}\n\nAssistant:\n${r}`;
    })
    .join("\n\n");

  const prev = params.previousSummary.trim().slice(0, 6000);
  const res = await geminiGenerateContent({
    model: defaultGeminiTextModel(),
    systemInstruction: `You write concise CRM notes for a finish-carpentry sales team.
Output **markdown** with short bullets only (no preamble). Cover whatever is knowable from the chat:
- Project type / room / built-in or closet scope
- Style direction, materials vibe (no brands)
- Rough dimensions or W×H×D if stated
- Budget signals if any
- Constraints (condo rules, obstructions, timeline hints)
- Open questions / risks for the human rep
If the transcript is thin, say so in one line and list what is still unknown.
Do not invent measurements or prices not present in the text.`,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Prior CRM digest (may be empty — merge and refresh; drop stale contradictions if the latest turn overrides):\n${prev || "(none)"}\n\n--- Latest planner turns (newest block first) ---\n\n${block}`,
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
    retryTransientErrors: true,
  });
  if (!res.ok) return null;
  const text = extractGeminiText(res.json);
  return text.length > 0 ? text.slice(0, 12_000) : null;
}
