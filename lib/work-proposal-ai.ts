import { geminiTextChat, geminiPlannerTurn, isGeminiConfigured } from "@/lib/gemini-client";

type ContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const PROPOSAL_SYSTEM = `You write formal **job proposals** for Level Up Install (Toronto-area finish carpentry).
Output **Markdown only** (no JSON). Use clear headings (##, ###), bullet lists, and short paragraphs.

Required sections (use these exact ## titles when possible):
## Project overview
## Concept visuals for records
(Briefly reference attached renderings if any; describe what they represent for install.)
## Installer drawings & placement notes
(ASCII layout sketches or numbered callouts are encouraged; include assumed dimensions and placement relative to walls/fixtures when inferable from context; label "VERIFY ON SITE".)
## Estimated installer time
(Give a range of hours and note assumptions.)
## Estimated schedule
(Calendar-days range from deposit/materials readiness through typical completion — clarify dependencies.)
## Materials list & procurement
(Table or bullets: item, qty/spec notes, suggested retailer type or category; state clearly that **procurement through Level Up is subject to a 15% markup** on documented supplier costs.)
## Investment
(Placeholder line: "Amount confirmed by Level Up admin before sending" unless amounts appear in context.)
## Next steps

Tone: professional, readable, honest about uncertainty. Do not invent SKUs; generic categories are fine.`;

function combineProposalReferenceImages(
  spaceParts: ContentPart[],
  renderingParts: ContentPart[],
  max = 4,
): ContentPart[] {
  const result: ContentPart[] = [];
  let si = 0;
  let ri = 0;
  while (result.length < max && (si < spaceParts.length || ri < renderingParts.length)) {
    if (si < spaceParts.length) {
      result.push(spaceParts[si]);
      si += 1;
    }
    if (result.length >= max) break;
    if (ri < renderingParts.length) {
      result.push(renderingParts[ri]);
      ri += 1;
    }
  }
  return result;
}

/** Pulls likely budget lines from the planner transcript for CRM / proposal header context. */
export function extractBudgetHintFromTranscript(transcript: string): string | undefined {
  const t = transcript.trim();
  if (!t) return undefined;
  const lines = t.split(/\n/);
  const hits: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      /\$\s*[\d,]+/.test(line) ||
      /\d\s*k\b/i.test(line) ||
      lower.includes("budget") ||
      lower.includes(" spend ") ||
      lower.includes("investment")
    ) {
      const clip = line.trim().slice(0, 280);
      if (clip) hits.push(clip);
    }
    if (hits.length >= 5) break;
  }
  if (hits.length) return [...new Set(hits)].join(" · ").slice(0, 1200);
  const m = t.match(/\$[\d,]+(?:\.\d{2})?/);
  if (m) return `Mentioned amount: ${m[0]}`;
  return undefined;
}

function fallbackProposal(params: {
  clientName: string;
  transcript: string;
  renderingCount: number;
  spacePhotoCount?: number;
}): string {
  const clip = params.transcript.trim().slice(0, 12000);
  const spaceNote =
    params.spacePhotoCount && params.spacePhotoCount > 0
      ? ` The homeowner attached **${params.spacePhotoCount}** photo(s) of their space for context.`
      : "";
  return `## Project overview

Formal proposal draft for **${params.clientName}**, generated from the AI planning conversation. Level Up will refine measurements on site.${spaceNote}

## Concept visuals for records

${params.renderingCount > 0 ? `This package includes **${params.renderingCount}** concept rendering(s) captured from the planner for design alignment.` : "No planner renderings were attached to this request — admin can add reference images."}

## Installer drawings & placement notes

- Field-verify all dimensions before fabrication.
- Confirm wall/trim conditions, outlet locations, and floor level.

_(Gemini was unavailable — expand this section manually.)_

## Estimated installer time

**TBD** — typically ${params.transcript.length > 800 ? "multi-day for built-ins; confirm after site visit" : "schedule after site verification"}.

## Estimated schedule

Depends on material lead times and crew availability — often **2–6 weeks** from deposit and confirmed materials.

## Materials list & procurement

- To be finalized after site verification.
- **Procurement through Level Up:** documented supplier costs **+ 15% markup** unless otherwise agreed in writing.

## Investment

Set by Level Up admin before the proposal is emailed.

## Planning conversation (reference)

${clip || "(empty transcript)"}

## Next steps

Admin review → client acceptance → Stripe payment → scheduling.`;
}

export async function generateWorkProposalMarkdown(params: {
  clientName: string;
  serviceAddress?: string;
  transcript: string;
  renderingParts: ContentPart[];
  spacePhotoParts?: ContentPart[];
  budgetHint?: string;
}): Promise<string> {
  const addr = params.serviceAddress?.trim();
  const budgetLine = params.budgetHint?.trim()
    ? `\nBudget / spend cues from conversation: ${params.budgetHint.trim().slice(0, 1500)}`
    : "";
  const header = `Client: ${params.clientName}${addr ? `\nService address (if provided): ${addr}` : ""}${budgetLine}`;

  const spaceParts = params.spacePhotoParts ?? [];
  const renderingParts = params.renderingParts;

  if (!isGeminiConfigured()) {
    return fallbackProposal({
      clientName: params.clientName,
      transcript: params.transcript,
      renderingCount: renderingParts.filter((p) => "inline_data" in p).length,
      spacePhotoCount: spaceParts.filter((p) => "inline_data" in p).length,
    });
  }

  const imageGuide =
    spaceParts.length && renderingParts.length
      ? "\n\n(Attached images alternate: customer space photo, then agreed concept rendering when both are present.)"
      : spaceParts.length
        ? "\n\n(Attached images are photos of the customer's space.)"
        : "";

  const userBlob = `${header}${imageGuide}

## Transcript (AI planner)

${params.transcript.trim().slice(0, 14000)}`;

  const combined = combineProposalReferenceImages(spaceParts, renderingParts, 4);
  if (combined.length > 0) {
    const multimodal = await geminiPlannerTurn({
      systemInstruction:
        "You are a senior estimator and draftsman for residential finish carpentry. Follow instructions precisely.",
      userText: `${PROPOSAL_SYSTEM}\n\n---\n\nProduce the proposal now.\n\n${userBlob}`,
      imageParts: combined,
    });
    if (!("error" in multimodal) && multimodal.text.trim()) return multimodal.text.trim();
  }

  const chat = await geminiTextChat({
    systemInstruction: PROPOSAL_SYSTEM,
    history: [],
    message: userBlob,
  });
  if (!("error" in chat) && chat.text.trim()) return chat.text.trim();

  return fallbackProposal({
    clientName: params.clientName,
    transcript: params.transcript,
    renderingCount: renderingParts.filter((p) => "inline_data" in p).length,
    spacePhotoCount: spaceParts.filter((p) => "inline_data" in p).length,
  });
}

export async function reviseWorkProposalMarkdown(params: {
  currentMarkdown: string;
  instruction: string;
}): Promise<{ markdown: string } | { error: string }> {
  if (!isGeminiConfigured()) {
    return {
      markdown: `${params.currentMarkdown}\n\n---\n\n### Admin edit note\n${params.instruction.trim()}`,
    };
  }

  const system = `You revise formal Markdown job proposals for Level Up Install.
Return **only** the full updated Markdown document — no preamble or code fences.
Preserve structure unless the user asks to reorganize. Keep the 15% procurement markup disclosure if materials are mentioned.`;

  const result = await geminiTextChat({
    systemInstruction: system,
    history: [
      { role: "user", content: params.currentMarkdown.slice(0, 24000) },
      {
        role: "assistant",
        content: "Understood — I have the current proposal Markdown.",
      },
    ],
    message: params.instruction.trim().slice(0, 8000),
  });

  if ("error" in result) return { error: result.error };
  const text = result.text.trim();
  if (!text) return { error: "Empty AI response." };
  return { markdown: text };
}

export function defaultProposalTitle(clientName: string): string {
  const n = clientName.trim() || "Client";
  return `Finish carpentry proposal — ${n}`;
}
