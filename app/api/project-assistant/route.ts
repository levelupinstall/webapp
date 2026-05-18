import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  buildGeminiConceptImagePromptText,
  defaultGeminiImageModel,
  geminiExtractPlannerVisualSpec,
  geminiGenerateConceptImage,
  geminiPlannerMultiTurn,
  homeownerPureEnthusiasmAfterSketch,
  homeownerSignalsHappyOrReady,
  isGeminiConfigured,
} from "@/lib/gemini-client";
import {
  extractPlannerPhase,
  stripMisleadingImageDeliveryClaims,
  stripPlannerPhaseMarkers,
  type PlannerPhaseTag,
} from "@/lib/planner-phase-utils";
import {
  deriveNorthStarLabelsFromUserText,
  hasBudgetContextInText,
  hasEarlyPhotoInviteContext,
  hasSimplifiedIntakeReady,
} from "@/lib/planner-intake-detect";
import {
  applyHarvestSafetyCategoryFallbacks,
  buildFullPlannerTranscriptForHarvest,
  buildHarvestConceptPromptBundle,
  buildNorthStarGoalSummaryFromMessages,
  harvestPlannerImageContextFromTranscript,
  logHarvestAssumptions,
  resolveEffectiveWorkCategoryForHarvest,
  type HarvestPromptVisualMode,
} from "@/lib/planner-image-context-harvest";
import {
  applyFullCarpenterPipeline,
  buildAdaptiveScaleInjection,
  buildExtractedVisualDirective,
  emptyPlannerVisualSpec,
  extractCeilingHeightFeetFromTranscript,
  inferDesignCategoryBucket,
  mergePlannerFixtureCounts,
  transcriptSuggestsCloset,
  type PlannerVisualSpec,
} from "@/lib/planner-visual-spec";
import { PLANNER_ASSISTANT_SYSTEM } from "@/lib/planner-assistant-prompt";
import {
  extractPlannerRoomPhotoHints,
  formatPlannerPhotoHintsForSystemInstruction,
  formatPlannerPhotoHintsForTranscriptAppendix,
} from "@/lib/planner-photo-hints";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import {
  addClientSpacePhoto,
  appendAiPlannerActivity,
  getPortalSpacePhotoInlineParts,
} from "@/lib/client-portal-store";
import { replicateConceptProviderEnabled } from "@/lib/replicate-sdxl-controlnet-concept";
import { appendVisualizationUnavailableNotice } from "@/lib/planner-render-outcome-messages";
import type { ConceptRenderAudit } from "@/lib/client-portal-store";

/** After this many assistant turns that included a concept sketch, steer toward in-person consult. */
const SKETCH_ROUNDS_BEFORE_IN_PERSON_NUDGE = 5;

/** Gallery uploads sometimes omit MIME type (e.g. HEIC); match client-side acceptance. */
function isPlannerImageUpload(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const n = file.name.toLowerCase();
  return /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(n);
}

/** User messages shorter than this skip generic blank-room sketch generation (avoids noisy renders). */
const MIN_USER_CHARS_FOR_GENERIC_SKETCH = 40;

/** Persist AI-generated concept images for admin CRM (bounded size). */
function conceptImagesForAdminCrm(
  responseImages: { mimeType: string; data: string }[],
): Array<{ mimeType: string; dataUrl: string }> {
  const MAX_IMAGES = 3;
  const MAX_PER_DATA_URL = 480_000;
  const MAX_COMBINED = 1_200_000;

  const out: Array<{ mimeType: string; dataUrl: string }> = [];
  let combined = 0;
  for (const img of responseImages.slice(0, MAX_IMAGES)) {
    const mime = (img.mimeType || "image/png").trim() || "image/png";
    const dataUrl = `data:${mime};base64,${img.data}`;
    if (dataUrl.length > MAX_PER_DATA_URL) continue;
    if (combined + dataUrl.length > MAX_COMBINED && out.length > 0) break;
    out.push({ mimeType: mime, dataUrl });
    combined += dataUrl.length;
  }
  return out;
}

export const maxDuration = 120;

function plannerEnvFlagEnabled(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function shouldShowSubmitDesignCta(params: {
  cleanReply: string;
  phase: PlannerPhaseTag;
  advanceTowardSiteVisit: boolean;
  hasBudgetContext: boolean;
  hasPhone: boolean;
  hasCallWindow: boolean;
}) {
  const intakeComplete =
    params.hasBudgetContext && params.hasPhone && params.hasCallWindow;
  if (!intakeComplete) return false;
  if (params.advanceTowardSiteVisit) return true;
  const text = params.cleanReply.toLowerCase();
  const asksReadiness =
    /ready/.test(text) &&
    (text.includes("next stage") ||
      text.includes("move forward") ||
      text.includes("proposal") ||
      text.includes("review"));
  if (asksReadiness && (params.phase === "recommend" || params.phase === "refine")) return true;
  return false;
}

function buildPlannerSystemInstruction(params: {
  priorTurnHadConceptImage: boolean;
  sketchLikelyAfterReply: boolean;
  /** True when the first concept image is blocked (simplified intake incomplete). */
  blockFirstRenderImage: boolean;
  userAttachedPhotosThisTurn: boolean;
  hasPhotoContextInSession: boolean;
  sketchRoundsDelivered: number;
  suggestInPersonAfterManySketches: boolean;
  advanceTowardSiteVisit: boolean;
  hasBudgetContext: boolean;
  hasPhone: boolean;
  hasCallWindow: boolean;
  /** Category + style signals present — invite photos early. */
  northStarReadyForPhotoPrompt: boolean;
  /** Photos + type + budget + style + rough dimensions present in chat. */
  simplifiedIntakeReady: boolean;
  /** Optional multimodal vision hints for this turn’s uploads — not measurements. */
  roomPhotoHintsBlock?: string;
}): string {
  const chunks: string[] = [PLANNER_ASSISTANT_SYSTEM];

  if (params.priorTurnHadConceptImage) {
    chunks.push(`
## Session hint (platform)
Your immediately previous assistant turn included a **concept visualization** the homeowner saw. Their latest message may react to that image—prioritize what they **like** vs want **changed**. A **revised sketch may be generated** after your reply when they give feedback; **do not** say you personally generated or attached it. Stay concise; end with a **follow-up question**. **Do not** name products, stores, or prices—design and proportions only.`);
  }

  if (params.sketchLikelyAfterReply) {
    if (params.blockFirstRenderImage) {
      chunks.push(`
## Session hint (platform — no visualization this turn)
The **first** concept image is **not** being attached on this reply because simplified intake is **not** complete yet (need space photos plus project type, budget, style, and rough dimensions in chat). Do **not** say you created, generated, produced, attached, or showed a sketch or picture, and do **not** say they should see an image **below** this message — **there will not be one**. Use the **3-question intake** script (type+budget → style → dimensions in one ask each) — do not drill many small questions.`);
    } else {
      chunks.push(`
## Session hint (platform)
The platform **may** attach a concept sketch after this reply—either tied to their room photos or a **neutral blank-studio style** preview if they have not shared pictures. **Never** claim you created, rendered, or attached the image. Focus on **look and layout**. **Do not** mention retailers, SKUs, or prices. Ask one clear **question** about whether the direction feels close—not a statement ending.`);
    }
  }

  if (params.userAttachedPhotosThisTurn) {
    chunks.push(`
## Session hint (photo just uploaded)
They attached **space photos**. Thank them briefly. Note visible obstructions only if relevant. Continue **simplified intake** (type+budget → style → all dimensions in one question) for anything still missing — do **not** run a long survey. Use \`[PHASE:recommend]\` until a concept sketch exists; then \`[PHASE:refine]\` when iterating.`);
  }
  if (!params.hasPhotoContextInSession && params.northStarReadyForPhotoPrompt) {
    chunks.push(`
## Session hint (photo invite)
Invite clear photos of the space — include \`[PHOTO_PROMPT]\` when asking for uploads. Photos are welcome before all intake answers are complete.`);
  }

  if (params.suggestInPersonAfterManySketches) {
    const n = params.sketchRoundsDelivered;
    chunks.push(`
## Session hint (platform)
The homeowner has already received **${n} rounds** with AI concept sketches in this chat. If they still sound unhappy or keep asking for big visual swings, **set expectations kindly**: this planner is for **exploring how things could look**—not a substitute for walking the space. Say **Level Up can review everything here** and follow up with **next steps in writing** when they're ready. Stay brief; it's okay to offer smaller visual tweaks.`);
  }

  if (params.advanceTowardSiteVisit) {
    chunks.push(`
## Session hint (platform)
The homeowner sounds **happy with the design direction** or **ready to move forward having the work done**. Continue **entirely in chat**: warmly explain that **Level Up will review what you've explored together here** (including the visuals) and **will reach out with a more detailed proposal for your approval** before work is scheduled — **no shopping lists, prices, or store names** in this planner. Do **not** mention checkout, deposits, or Terms of Service here. Optional **one light planning question** (e.g. rough timing or area of town) if helpful—still end with a **question** when natural.`);
  }

  if (!params.hasBudgetContext && !params.simplifiedIntakeReady) {
    chunks.push(`
## Session hint (intake)
Budget is still missing — combine **project type + budget** in your next single intake question (do not ask budget alone after a separate type question if you can merge them).`);
  }
  const deferContactNudgeUntilAfterConcept = params.priorTurnHadConceptImage;
  if (deferContactNudgeUntilAfterConcept && !params.hasPhone) {
    chunks.push(`
## Session hint (proposal handoff — after a design direction exists)
Phone number is still missing for **Level Up’s follow-up after they’re happy with the direction**. Ask for the best number when natural — **do not** say any AI sketch is withheld until they provide it.`);
  }
  if (deferContactNudgeUntilAfterConcept && !params.hasCallWindow) {
    chunks.push(`
## Session hint (proposal handoff — after a design direction exists)
Callback timing is still missing for **scheduling / follow-up**. Ask for ideal days or times when natural — **do not** say any AI sketch is withheld until they provide it.`);
  }

  if (
    params.simplifiedIntakeReady &&
    !params.priorTurnHadConceptImage &&
    params.hasPhotoContextInSession &&
    !params.blockFirstRenderImage
  ) {
    chunks.push(`
## Session hint (optional — light draft confirm)
Simplified intake looks complete (photos, type, budget, style, dimensions). You **may** ask once in natural language if they want to see a **first draft visual** — e.g. “Want me to show how this could look?” This is **optional** and **not** required for the platform to attach a sketch. Do **not** use the old verbatim gate question or require “go ahead” / “proceed”.`);
  }

  const hints = params.roomPhotoHintsBlock?.trim();
  if (hints) {
    chunks.push(`
## Session hint (platform — latest upload vision hints)
The block below is **not** a tape measure — it is **soft cues** from the image(s) they just sent (visibility, uncertainty, suggested **questions** to ask next). Use it to steer **Phase 3** and dimension follow-ups; **never** invent or assert inch/cm/mm room sizes from pixels alone. Prefer their **stated units** in chat.

${hints}`);
  }

  return chunks.join("\n");
}

function hasBudgetContext(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\$+\s*\d/.test(text) ||
    /\b\d+\s*k\b/i.test(text) ||
    t.includes("budget") ||
    t.includes("spend") ||
    t.includes("investment")
  );
}

function hasPhoneNumber(text: string): boolean {
  return /(?:\+?1[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?)\d{3}[\s\-]?\d{4}/.test(text);
}

function hasCallWindow(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("morning") ||
    t.includes("afternoon") ||
    t.includes("evening") ||
    t.includes("weekend") ||
    t.includes("weekday") ||
    t.includes("after ") ||
    t.includes("between ") ||
    t.includes("anytime") ||
    /\b\d{1,2}\s?(am|pm)\b/i.test(t)
  );
}

type PlainChatRole = "user" | "assistant";

export type PlannerClientMessage = {
  role: PlainChatRole;
  content: string;
};

type ContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** How much prior conversation context we pass back to Gemini each turn. */
const MAX_MESSAGES = 200;

/** Chat turns fed into visual-field extraction (text-only JSON step before image generation). */
const VISUAL_EXTRACTION_MESSAGE_WINDOW = 100;

function parseClientPhase(raw: string): PlannerPhaseTag {
  const p = raw.trim().toLowerCase();
  if (p === "recommend" || p === "refine") return p;
  return "consultation";
}

function buildGeminiContents(
  messages: PlannerClientMessage[],
  latestImageParts: ContentPart[],
): Array<{ role: "user" | "model"; parts: ContentPart[] }> | null {
  if (messages.length === 0) return null;
  const trimmed = messages.slice(-MAX_MESSAGES);
  const contents: Array<{ role: "user" | "model"; parts: ContentPart[] }> = [];

  for (let i = 0; i < trimmed.length - 1; i++) {
    const m = trimmed[i];
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  const last = trimmed[trimmed.length - 1];
  if (last.role !== "user") return null;

  const parts: ContentPart[] = [];
  const text = last.content.trim();
  if (text) {
    parts.push({ text });
  } else if (latestImageParts.length > 0) {
    parts.push({
      text: "(The homeowner shared a photo of their space.)",
    });
  }

  for (const img of latestImageParts) {
    parts.push(img);
  }

  if (parts.length === 0) return null;

  contents.push({ role: "user", parts });
  return contents;
}

function buildConversationMemoryHint(messages: PlannerClientMessage[]): string {
  const recent = messages.slice(-MAX_MESSAGES);
  const priorUser = recent
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const hasBudgetContext =
    /\$+\s*\d/.test(priorUser) ||
    /\b\d+\s*k\b/i.test(priorUser) ||
    priorUser.includes("budget") ||
    priorUser.includes("investment") ||
    priorUser.includes("spend");
  const hasPhone =
    /(?:\+?1[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?)\d{3}[\s\-]?\d{4}/.test(priorUser);
  const hasCallWindow =
    /\b\d{1,2}\s?(am|pm)\b/i.test(priorUser) ||
    ["morning", "afternoon", "evening", "weekday", "weekend", "anytime"].some((k) =>
      priorUser.includes(k),
    );

  return `
## Conversation memory (critical)
Use the full chat history provided in this request, not only the latest message.
- Reference earlier homeowner goals, constraints, and preferences when you reply.
- Keep recommendations consistent with prior details unless the homeowner explicitly changes direction.
- If budget/contact details are already in prior turns, do not re-ask the same question.

Known from prior turns:
- Budget context captured: ${hasBudgetContext ? "yes" : "no"}
- Phone captured: ${hasPhone ? "yes" : "no"}
- Preferred call timing captured: ${hasCallWindow ? "yes" : "no"}
`.trim();
}

/** Keep server logs readable (Gemini error JSON can be large). */
const PLANNER_LOG_DETAIL_MAX = 2500;

function truncateForPlannerLog(s: string): string {
  return s.length > PLANNER_LOG_DETAIL_MAX
    ? `${s.slice(0, PLANNER_LOG_DETAIL_MAX)}…`
    : s;
}

function buildFallbackReply(imageCount: number): string {
  const photoNote =
    imageCount > 0
      ? "Thanks for the photo — that's helpful.\n\n"
      : "";
  return `${photoNote}I'm having a quick connection hiccup on my side. Let's keep going — are you leaning toward a simpler refresh or something more built-out for this space?

[PHASE:consultation]`;
}

async function loadLatestImageParts(images: File[]): Promise<ContentPart[]> {
  return Promise.all(
    images.map(async (image) => {
      const bytes = Buffer.from(await image.arrayBuffer());
      return {
        inline_data: {
          mime_type: image.type || "image/jpeg",
          data: bytes.toString("base64"),
        },
      };
    }),
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function buildSkippedConceptRenderAudit(params: {
  reason: string;
  lastUserText: string;
  referenceImageCount: number;
}): ConceptRenderAudit {
  const reason = params.reason.trim().slice(0, 2000);
  return {
    provider: "gemini",
    imageModel: defaultGeminiImageModel(),
    homeownerPrompt: params.lastUserText.slice(0, 16_000) || "(photo)",
    renderPromptText: `(Render not attempted)\n\n${reason}`,
    referenceImageCount: params.referenceImageCount,
    renderedAt: new Date().toISOString(),
    renderError: reason,
  };
}

function explainConceptRenderSkip(params: {
  isGeminiConfigured: boolean;
  allowConceptImage: boolean;
  blockFirstRenderImage: boolean;
  simplifiedIntakeReady: boolean;
  hasPhotoContextInSession: boolean;
  pureEnthusiasmAfterSketch: boolean;
  hasUserMessage: boolean;
  plannerInlineImagesCount: number;
  userAttachedPhotosThisTurn: boolean;
  conceptReferenceCount: number;
  priorTurnHadConceptImage: boolean;
}): string {
  if (params.allowConceptImage) {
    return "Concept render was allowed but did not run (unexpected — check server logs).";
  }
  if (!params.isGeminiConfigured) {
    return "GEMINI_API_KEY is not configured on the server.";
  }
  if (params.plannerInlineImagesCount > 0) {
    return "Planner chat returned inline images; separate concept render was skipped.";
  }
  if (params.blockFirstRenderImage) {
    if (!params.simplifiedIntakeReady) {
      return "First render blocked: need project type, style, budget signal, and rough dimensions in the chat.";
    }
    if (!params.hasPhotoContextInSession) {
      return "First render blocked: no space photos on this request. Re-attach room photos or sign in so saved CRM photos can be used.";
    }
  }
  if (params.pureEnthusiasmAfterSketch) {
    return "Render skipped: short positive reply after a prior sketch (no change requested).";
  }
  if (!params.hasUserMessage) {
    return "Render skipped: empty user message.";
  }
  if (
    !params.userAttachedPhotosThisTurn &&
    !params.priorTurnHadConceptImage &&
    params.conceptReferenceCount === 0
  ) {
    return "Render skipped: no room photos or prior concept reference on this turn.";
  }
  return "Render skipped: gate conditions not met for this turn.";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const messagesRaw = String(formData.get("messages") ?? "");
    let messages: PlannerClientMessage[] = [];
    try {
      messages = JSON.parse(messagesRaw) as PlannerClientMessage[];
    } catch {
      return NextResponse.json({ error: "Invalid messages payload." }, { status: 400 });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "At least one message is required." },
        { status: 400 },
      );
    }

    const plannerDebugDiagnostics =
      plannerEnvFlagEnabled("PLANNER_DEBUG_DIAGNOSTICS") ||
      process.env.NODE_ENV === "development";

    const clientPhase = parseClientPhase(String(formData.get("phase") ?? ""));

    const priorTurnHadConceptImage =
      String(formData.get("priorTurnHadConceptImage") ?? "").toLowerCase() === "true" ||
      String(formData.get("priorTurnHadConceptImage") ?? "") === "1";

    const sketchRoundsDeliveredRaw = String(formData.get("sketchRoundsDelivered") ?? "");
    const sketchRoundsDelivered = Math.min(
      99,
      Math.max(0, parseInt(sketchRoundsDeliveredRaw, 10) || 0),
    );

    const suggestInPersonAfterManySketches =
      sketchRoundsDelivered >= SKETCH_ROUNDS_BEFORE_IN_PERSON_NUDGE;

    const files = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File);

    const imageFiles = files.filter(
      (file) => isPlannerImageUpload(file) && file.size <= 5 * 1024 * 1024,
    );

    const sketchRefRaw = formData
      .getAll("sketchReferenceImages")
      .filter((value): value is File => value instanceof File);
    const sketchReferenceFiles = sketchRefRaw.filter(
      (file) => isPlannerImageUpload(file) && file.size <= 5 * 1024 * 1024,
    );

    const lastUserText =
      [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
    const allUserText = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    const intakeHasBudget = hasBudgetContextInText(allUserText);
    const intakeHasPhone = hasPhoneNumber(allUserText);
    const intakeHasCallWindow = hasCallWindow(allUserText);
    const northStarReadyForPhotoPrompt = hasEarlyPhotoInviteContext(allUserText);
    const simplifiedIntakeReady = hasSimplifiedIntakeReady(allUserText);

    if (!lastUserText && imageFiles.length === 0) {
      return NextResponse.json(
        { error: "Add a message or attach at least one photo." },
        { status: 400 },
      );
    }

    const portalSession = await getSessionFromCookie();
    const portalSpacePhotoParts =
      portalSession?.userId
        ? await getPortalSpacePhotoInlineParts(portalSession.userId, 4)
        : [];

    const userAttachedPhotosThisTurn = imageFiles.length > 0;
    const hasPhotoContextInSession =
      userAttachedPhotosThisTurn ||
      sketchReferenceFiles.length > 0 ||
      portalSpacePhotoParts.length > 0;
    const hasAnyPriorRender =
      sketchRoundsDelivered > 0 || priorTurnHadConceptImage;
    const blockFirstRenderImage =
      !hasAnyPriorRender &&
      (!simplifiedIntakeReady || !hasPhotoContextInSession);

    const pureEnthusiasmAfterSketch =
      priorTurnHadConceptImage &&
      !userAttachedPhotosThisTurn &&
      homeownerPureEnthusiasmAfterSketch(lastUserText);

    const advanceTowardSiteVisit =
      homeownerSignalsHappyOrReady(lastUserText) &&
      (clientPhase === "recommend" ||
        clientPhase === "refine" ||
        priorTurnHadConceptImage);

    const trimmedUser = lastUserText.trim();
    const hasUserMessage = trimmedUser.length > 0;
    const substantiveForGenericSketch =
      trimmedUser.length >= MIN_USER_CHARS_FOR_GENERIC_SKETCH;

    const likelyGenericBlankSketch =
      substantiveForGenericSketch &&
      !userAttachedPhotosThisTurn &&
      imageFiles.length === 0 &&
      sketchReferenceFiles.length === 0;

    const latestImageParts = await loadLatestImageParts(imageFiles);
    const sketchReferenceParts = await loadLatestImageParts(sketchReferenceFiles);

    const allowRefinementBaselineUpload =
      plannerEnvFlagEnabled("PLANNER_REFINEMENT_BASELINE") ||
      priorTurnHadConceptImage ||
      sketchRoundsDelivered > 0;

    const refinementBaseRaw = formData.get("refinementBaseImage");
    const refinementBaseFile =
      allowRefinementBaselineUpload &&
      refinementBaseRaw instanceof File &&
      refinementBaseRaw.size > 0 &&
      refinementBaseRaw.size <= 5 * 1024 * 1024 &&
      isPlannerImageUpload(refinementBaseRaw)
        ? refinementBaseRaw
        : null;

    const refinementBaseParts = refinementBaseFile
      ? await loadLatestImageParts([refinementBaseFile])
      : [];

    let conceptReferenceParts = [...sketchReferenceParts, ...latestImageParts];
    if (conceptReferenceParts.length === 0 && portalSpacePhotoParts.length > 0) {
      conceptReferenceParts = [...portalSpacePhotoParts];
    }
    /**
     * Default image order when no structural blueprint: refinement baseline first, then space photos.
     * When a blueprint PNG is attached, order becomes room → blueprint → baseline (see `structuralGuideDirective`).
     */
    const combinedConceptReferenceParts = [
      ...refinementBaseParts,
      ...conceptReferenceParts,
    ];

    let roomPhotoHintsTranscriptAppendix = "";
    let roomPhotoHintsSystemBlock = "";
    let roomPhotoHintsSummaryForActivity: string | undefined;
    if (userAttachedPhotosThisTurn && latestImageParts.length > 0 && isGeminiConfigured()) {
      const inlineOnly = latestImageParts.filter(
        (p): p is ContentPart & { inline_data: { mime_type: string; data: string } } =>
          "inline_data" in p &&
          typeof p.inline_data.mime_type === "string" &&
          typeof p.inline_data.data === "string" &&
          p.inline_data.data.length >= 64,
      );
      try {
        const hints = await extractPlannerRoomPhotoHints({
          imageParts: inlineOnly,
          lastUserMessage: lastUserText,
        });
        if (hints) {
          roomPhotoHintsSystemBlock = formatPlannerPhotoHintsForSystemInstruction(hints);
          roomPhotoHintsTranscriptAppendix =
            formatPlannerPhotoHintsForTranscriptAppendix(hints);
          roomPhotoHintsSummaryForActivity = roomPhotoHintsTranscriptAppendix.slice(0, 6000);
        }
      } catch (e) {
        console.warn("[project-assistant] room photo hints extraction skipped:", e);
      }
    }

    /**
     * True when a concept sketch is plausibly generated after this reply.
     * Must count re-sent `sketchReferenceImages` (not only `images` this turn), otherwise
     * Phase-4 text confirmations with re-attached room photos skip hints / `allowConceptImage`.
     */
    const sketchLikelyAfterReply =
      !pureEnthusiasmAfterSketch &&
      (userAttachedPhotosThisTurn ||
        (priorTurnHadConceptImage && hasUserMessage) ||
        likelyGenericBlankSketch ||
        (conceptReferenceParts.length > 0 && hasUserMessage));

    const contents = buildGeminiContents(messages, latestImageParts);
    if (!contents) {
      return NextResponse.json(
        { error: "Conversation must end with your latest message." },
        { status: 400 },
      );
    }

    let replyRaw = "";
    let usedPlannerFallbackReply = false;
    let plannerInlineImages: { mimeType: string; data: string }[] = [];

    try {
      if (isGeminiConfigured()) {
        const result = await geminiPlannerMultiTurn({
          systemInstruction: `${buildPlannerSystemInstruction({
            priorTurnHadConceptImage,
            sketchLikelyAfterReply,
            blockFirstRenderImage,
            userAttachedPhotosThisTurn,
            hasPhotoContextInSession,
            sketchRoundsDelivered,
            suggestInPersonAfterManySketches,
            advanceTowardSiteVisit,
            hasBudgetContext: intakeHasBudget,
            hasPhone: intakeHasPhone,
            hasCallWindow: intakeHasCallWindow,
            simplifiedIntakeReady,
            northStarReadyForPhotoPrompt,
            ...(roomPhotoHintsSystemBlock.trim()
              ? { roomPhotoHintsBlock: roomPhotoHintsSystemBlock }
              : {}),
          })}\n\n${buildConversationMemoryHint(messages)}`,
          contents,
        });

        if ("error" in result) {
          console.warn(
            "[project-assistant] geminiPlannerMultiTurn failed:",
            truncateForPlannerLog(result.error),
          );
        } else {
          replyRaw = result.text.trim();
          plannerInlineImages = result.images
            .filter((img) => img.dataBase64.length >= 64)
            .map((img) => ({
              mimeType: img.mimeType,
              data: img.dataBase64,
            }));
          if (blockFirstRenderImage) {
            plannerInlineImages = [];
          }
          if (!replyRaw) {
            if (result.blockReason) {
              console.warn(
                "[project-assistant] geminiPlannerMultiTurn returned empty text; promptFeedback.blockReason:",
                result.blockReason,
              );
            } else {
              console.warn(
                "[project-assistant] geminiPlannerMultiTurn returned empty text and no blockReason (check API response / candidates / finishReason).",
              );
            }
          }
        }
      } else {
        console.warn(
          "[project-assistant] GEMINI_API_KEY is not set — planner cannot call Gemini (fallback reply only).",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
      console.warn("[project-assistant] geminiPlannerMultiTurn threw:", message);
      replyRaw = "";
    }

    if (!replyRaw) {
      usedPlannerFallbackReply = true;
      console.warn(
        "[project-assistant] Using canned fallback reply (connection hiccup copy). See warnings above for root cause.",
      );
      replyRaw = buildFallbackReply(imageFiles.length);
    }

    let replyForPhase = replyRaw;
    if (!northStarReadyForPhotoPrompt && /\[PHOTO_PROMPT\]/i.test(replyForPhase)) {
      replyForPhase = replyForPhase
        .replace(/\[PHOTO_PROMPT\]/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    const {
      cleanReply: cleanReplyRaw,
      phase: phaseFromModel,
      showPhotoUploader,
    } = extractPlannerPhase(replyForPhase);
    let phase = phaseFromModel;

    const genericBlankSketchEligible =
      substantiveForGenericSketch &&
      !userAttachedPhotosThisTurn &&
      conceptReferenceParts.length === 0 &&
      (phase === "consultation" ||
        phase === "recommend" ||
        phase === "refine");

    const allowConceptImage =
      isGeminiConfigured() &&
      plannerInlineImages.length === 0 &&
      !blockFirstRenderImage &&
      !pureEnthusiasmAfterSketch &&
      hasUserMessage &&
      (userAttachedPhotosThisTurn ||
        (priorTurnHadConceptImage && hasUserMessage) ||
        genericBlankSketchEligible ||
        (conceptReferenceParts.length > 0 && !blockFirstRenderImage));

    const responseImages: { mimeType: string; data: string }[] = [
      ...plannerInlineImages,
    ];

    let cleanReply = cleanReplyRaw;
    let conceptRenderAuditForActivity: ConceptRenderAudit | undefined;

    if (allowConceptImage && responseImages.length === 0) {
      if (hasAnyPriorRender && refinementBaseParts.length === 0) {
        console.warn(
          "[project-assistant] Refinement image generation without refinementBaseImage — delta fidelity may suffer; client should send last concept.",
        );
      }

      const transcriptRecent = messages
        .slice(-12)
        .map(
          (m) =>
            `${m.role === "user" ? "Homeowner" : PLANNER_ASSISTANT_NAME}: ${m.content}`,
        )
        .join("\n");

      const exploratoryNote =
        conceptReferenceParts.length > 0
          ? "\n\n(Context: homeowner reference photos are attached — produce an updated concept that applies their latest feedback while preserving their actual room's layout, openings, and proportions.)"
          : phase === "consultation" && userAttachedPhotosThisTurn
            ? "\n\n(Context: homeowner shared real room photos during consultation — anchor the sketch to their space and stated goals; still not a final quote.)"
            : phase === "consultation"
              ? "\n\n(Context: consultation — no room photos in request; neutral blank studio backdrop, illustrative proportions only.)"
              : "\n\n(Context: no reference photos — neutral blank studio room; apply chat feedback to the concept.)";

      const extractionWindowTranscript = messages
        .slice(-VISUAL_EXTRACTION_MESSAGE_WINDOW)
        .map((m) => {
          const label = m.role === "user" ? "Homeowner" : PLANNER_ASSISTANT_NAME;
          const body =
            m.role === "assistant" ? stripPlannerPhaseMarkers(m.content) : m.content;
          return `${label}: ${body}`;
        })
        .join("\n");

      const plannerHarvestFullExtract = plannerEnvFlagEnabled(
        "PLANNER_HARVEST_FULL_TRANSCRIPT",
      );
      const cappedFullHarvestTranscript = plannerHarvestFullExtract
        ? buildFullPlannerTranscriptForHarvest(messages.slice(-MAX_MESSAGES))
            .trim()
            .slice(-24_000)
        : "";

      const specTranscriptCore =
        plannerHarvestFullExtract && cappedFullHarvestTranscript.length > 0
          ? cappedFullHarvestTranscript
          : extractionWindowTranscript;
      const photoHintsAppendix = roomPhotoHintsTranscriptAppendix.trim();
      const specTranscript =
        photoHintsAppendix.length > 0
          ? `${specTranscriptCore}\n\n--- Latest uploaded space photo(s): vision hints for extraction (not field measurements; confirm in chat) ---\n${photoHintsAppendix}`.slice(
              -26_000,
            )
          : specTranscriptCore;

      const hasUserProvidedPhoto =
        combinedConceptReferenceParts.length > 0 || imageFiles.length > 0;
      const isClosetScope = transcriptSuggestsCloset(specTranscript);
      const ceilingFromTranscript =
        extractCeilingHeightFeetFromTranscript(specTranscript);

      const categoryBucketForScale = inferDesignCategoryBucket(specTranscript);
      let extractedVisualDirective = buildAdaptiveScaleInjection({
        hasUserProvidedPhoto,
        isCloset: isClosetScope,
        ceilingHeightFeet: ceilingFromTranscript,
        categoryBucket: categoryBucketForScale,
      });

      /** Spec snapshot driving W×H×D (inches) in the image directive — for render diagnostics only. */
      let conceptRenderSpec: PlannerVisualSpec | null = null;

      let rawSpec: PlannerVisualSpec | null = null;
      const extractStartedAt = Date.now();
      try {
        rawSpec = await geminiExtractPlannerVisualSpec(specTranscript);
      } catch {
        /* extraction must not block visuals */
      }
      if (plannerHarvestFullExtract) {
        console.info(
          "[project-assistant] geminiExtractPlannerVisualSpec durationMs:",
          Date.now() - extractStartedAt,
        );
      }

      const plannerHarvestV1 = plannerEnvFlagEnabled("PLANNER_HARVEST_V1");

      let basePrompt = `${transcriptRecent}\n\n${PLANNER_ASSISTANT_NAME} reply:\n${cleanReply.slice(0, 6000)}${exploratoryNote}`;
      let baseGoal =
        lastUserText.slice(0, 4000) || cleanReply.slice(0, 1200);

      if (!plannerHarvestV1) {
        if (rawSpec) {
          const corrected = mergePlannerFixtureCounts(
            applyFullCarpenterPipeline(rawSpec, specTranscript),
            specTranscript,
          );
          conceptRenderSpec = corrected;
          extractedVisualDirective = buildExtractedVisualDirective(corrected, {
            hasUserProvidedPhoto,
            isCloset: isClosetScope,
            extractionTranscript: specTranscript,
          });
        }
      } else {
        const harvestSourceTranscript =
          plannerHarvestFullExtract && cappedFullHarvestTranscript.length > 0
            ? cappedFullHarvestTranscript
            : extractionWindowTranscript;

        const photoHintsAppendixHarvest = roomPhotoHintsTranscriptAppendix.trim();
        const harvestExtractionTranscript =
          photoHintsAppendixHarvest.length > 0
            ? `${harvestSourceTranscript}\n\n--- Latest uploaded space photo(s): vision hints for extraction (not field measurements; confirm in chat) ---\n${photoHintsAppendixHarvest}`.slice(
                -26_000,
              )
            : harvestSourceTranscript;

        const correctedSpec = mergePlannerFixtureCounts(
          rawSpec ? applyFullCarpenterPipeline(rawSpec, specTranscript) : emptyPlannerVisualSpec(),
          specTranscript,
        );

        const northStarGoalSummary = buildNorthStarGoalSummaryFromMessages(messages);
        const effectiveWorkCategory = resolveEffectiveWorkCategoryForHarvest({
          northStarHomeownerOnly: deriveNorthStarLabelsFromUserText(allUserText).workCategory,
          extractionTranscript: harvestExtractionTranscript,
          designCategory: correctedSpec.designCategory ?? null,
        });

        const hasSpaceReference = combinedConceptReferenceParts.length > 0;
        const hasRefinementBaseline = refinementBaseParts.length > 0;

        const harvestFirstRender =
          !hasAnyPriorRender && !blockFirstRenderImage && hasSpaceReference;
        const harvestRefinementRound =
          hasAnyPriorRender &&
          !blockFirstRenderImage &&
          (hasRefinementBaseline || hasSpaceReference);
        const useHarvestPipeline = harvestFirstRender || harvestRefinementRound;

        const visualMode: HarvestPromptVisualMode =
          hasAnyPriorRender && useHarvestPipeline
            ? "refinement-delta"
            : "first-render";

        let harvest = harvestPlannerImageContextFromTranscript({
          extractionTranscript: harvestExtractionTranscript,
          baseSpec: correctedSpec,
        });
        harvest = applyHarvestSafetyCategoryFallbacks(harvest, effectiveWorkCategory, {
          transcriptForDimFallback: harvestExtractionTranscript,
        });
        logHarvestAssumptions("harvest", harvest.assumptionsLogged);

        conceptRenderSpec = harvest.spec;
        extractedVisualDirective = buildExtractedVisualDirective(harvest.spec, {
          hasUserProvidedPhoto,
          isCloset: isClosetScope,
          extractionTranscript: specTranscript,
        });

        if (useHarvestPipeline) {
          const bundle = buildHarvestConceptPromptBundle({
            harvest,
            hasUploadedSpacePhoto: hasSpaceReference,
            hasRefinementBaselineImage: hasRefinementBaseline,
            assistantReplySummary: cleanReply,
            northStarGoalSummary,
            lastUserFeedback: lastUserText,
            visualMode,
            refinementBaselineAttachmentPosition: hasRefinementBaseline ? "last" : "first",
          });
          basePrompt = `${bundle.promptContext}\n\n--- Conversation excerpt ---\n\n${transcriptRecent}\n\n${PLANNER_ASSISTANT_NAME} reply:\n${cleanReply.slice(0, 6000)}${exploratoryNote}`;
          baseGoal = bundle.userGoal;
        }
      }

      const harvestedDimensions = conceptRenderSpec
        ? {
            widthIn: conceptRenderSpec.width,
            heightIn: conceptRenderSpec.height,
            depthIn: conceptRenderSpec.depth,
            shelfBoardSpanAlongWallIn:
              conceptRenderSpec.shelfBoardSpanAlongWallIn ?? null,
            shelfVerticalSpacingIn:
              conceptRenderSpec.shelfVerticalSpacingIn ?? null,
          }
        : null;
      const categoryAnchors = {
        categoryBucket: categoryBucketForScale,
        hasUserProvidedPhoto,
        isClosetScope,
        ceilingHeightFeet: ceilingFromTranscript,
      };

      if (replicateConceptProviderEnabled()) {
        console.info(
          "[project-assistant] CONCEPT_IMAGE_PROVIDER=replicate is set but planner concept renders use Gemini only (blueprint path removed).",
        );
      }

      const conceptReferenceForRender =
        combinedConceptReferenceParts.length > 0 ? combinedConceptReferenceParts : undefined;

      console.log("--- RENDERING START (Gemini) ---");
      console.log("Target Dimensions:", harvestedDimensions);
      console.log("Scale Anchors Used:", categoryAnchors);

      let imageGenerationFailureDetail: string | null = null;
      let conceptRenderAudit: ConceptRenderAudit | undefined;

      let prevOkNoImages = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt >= 1 && prevOkNoImages) {
          await new Promise((r) => setTimeout(r, attempt === 1 ? 800 : attempt === 2 ? 1400 : 2000));
        }
        prevOkNoImages = false;

        const userGoalAug =
          attempt === 0
            ? baseGoal
            : attempt === 1
              ? `${baseGoal}\n\n(Second attempt: output must include one clear IMAGE part showing the finish-carpentry concept.)`
              : attempt === 2
                ? `${baseGoal}\n\n(Third attempt: mandatory — emit at least one IMAGE part; no text-only replies; prioritize a single clear finish-carpentry concept render.)`
                : `${baseGoal}\n\n(Fourth attempt: you MUST return one IMAGE inlineData part — no text-only response; single clearest concept render.)`;

        const renderPrep = buildGeminiConceptImagePromptText({
          promptContext: basePrompt,
          userGoal: userGoalAug,
          extractedVisualDirective,
        });

        const visual = await geminiGenerateConceptImage({
          promptContext: basePrompt,
          userGoal: userGoalAug,
          referenceImageParts: conceptReferenceForRender,
          extractedVisualDirective,
        });

        conceptRenderAudit = {
          provider: "gemini",
          imageModel: renderPrep.imageModel,
          homeownerPrompt: lastUserText.slice(0, 16_000) || "(photo)",
          renderPromptText: renderPrep.fullPromptText,
          ...(extractedVisualDirective?.trim()
            ? { extractedVisualDirective: extractedVisualDirective.trim().slice(0, 12_000) }
            : {}),
          referenceImageCount: conceptReferenceForRender?.length ?? 0,
          renderedAt: new Date().toISOString(),
        };

        if (!("error" in visual) && visual.images.length > 0) {
          for (const img of visual.images) {
            responseImages.push({ mimeType: img.mimeType, data: img.dataBase64 });
          }
          break;
        }
        if (!("error" in visual) && visual.images.length === 0) {
          prevOkNoImages = true;
          if (attempt === 3) {
            imageGenerationFailureDetail = "Gemini returned no image parts";
          }
        }
        if ("error" in visual) {
          console.warn(
            "[project-assistant] geminiGenerateConceptImage error:",
            visual.error,
          );
          imageGenerationFailureDetail = visual.error;
          conceptRenderAudit = {
            ...conceptRenderAudit,
            renderError: visual.error.slice(0, 2000),
          };
        } else if (visual.images.length === 0) {
          const fr = visual.candidateFinishReason;
          console.warn(
            "[project-assistant] geminiGenerateConceptImage returned no image parts",
            fr ? { candidateFinishReason: fr } : {},
          );
        }
      }

      if (responseImages.length === 0) {
        cleanReply = stripMisleadingImageDeliveryClaims(cleanReply);
        cleanReply = appendVisualizationUnavailableNotice(cleanReply, {
          technicalDetail: imageGenerationFailureDetail,
          skipIfConflictBlockPresent: false,
        });
        if (conceptRenderAudit && imageGenerationFailureDetail) {
          conceptRenderAudit = {
            ...conceptRenderAudit,
            renderError: imageGenerationFailureDetail.slice(0, 2000),
          };
        }
      }

      conceptRenderAuditForActivity = conceptRenderAudit;
    } else if (portalSession?.userId) {
      conceptRenderAuditForActivity = buildSkippedConceptRenderAudit({
        reason: explainConceptRenderSkip({
          isGeminiConfigured: isGeminiConfigured(),
          allowConceptImage,
          blockFirstRenderImage,
          simplifiedIntakeReady,
          hasPhotoContextInSession,
          pureEnthusiasmAfterSketch,
          hasUserMessage,
          plannerInlineImagesCount: plannerInlineImages.length,
          userAttachedPhotosThisTurn,
          conceptReferenceCount: combinedConceptReferenceParts.length,
          priorTurnHadConceptImage,
        }),
        lastUserText,
        referenceImageCount: combinedConceptReferenceParts.length,
      });
    }

    if (responseImages.length === 0) {
      cleanReply = stripMisleadingImageDeliveryClaims(cleanReply);
    }

    const anyConceptImageDeliveredBeforeOrNow =
      priorTurnHadConceptImage ||
      sketchRoundsDelivered > 0 ||
      responseImages.length > 0;
    if (phase === "refine" && !anyConceptImageDeliveredBeforeOrNow) {
      phase = "recommend";
      console.info(
        "[project-assistant] Phase clamped refine→recommend: no concept image in session yet (model tagged refine before first sketch).",
      );
    }

    if (portalSession?.userId) {
      try {
        if (imageFiles.length > 0) {
          for (const image of imageFiles.slice(0, 6)) {
            const dataUrl = await fileToDataUrl(image);
            await addClientSpacePhoto(portalSession.userId, {
              type: "image",
              url: dataUrl,
              caption: image.name?.trim() || "Planner space photo",
            });
          }
        }
        const conceptImages = conceptImagesForAdminCrm(responseImages);
        await appendAiPlannerActivity(
          portalSession.userId,
          {
            promptPreview: lastUserText.slice(0, 280) || "(photo)",
            replyPreview: cleanReply.slice(0, 480),
            promptFull: lastUserText.slice(0, 16_000),
            replyFull: cleanReply.slice(0, 24_000),
            intakeSummary: [
              `phase:${phase}`,
              `turns:${messages.length}`,
              `allowRender:${allowConceptImage}`,
              `blockFirst:${blockFirstRenderImage}`,
              `intakeReady:${simplifiedIntakeReady}`,
              `photos:${hasPhotoContextInSession}`,
              `portalPhotos:${portalSpacePhotoParts.length}`,
            ].join(";"),
            imageCount:
              imageFiles.length +
              sketchReferenceFiles.length +
              portalSpacePhotoParts.length +
              (refinementBaseFile ? 1 : 0) +
              responseImages.length,
            ...(conceptImages.length ? { conceptImages } : {}),
            ...(roomPhotoHintsSummaryForActivity?.trim()
              ? { photoHintsSummary: roomPhotoHintsSummaryForActivity }
              : {}),
            ...(conceptRenderAuditForActivity
              ? { conceptRenderAudit: conceptRenderAuditForActivity }
              : {}),
          },
        );
      } catch (activityErr) {
        console.warn(
          "[project-assistant] appendAiPlannerActivity failed:",
          activityErr instanceof Error ? activityErr.message : activityErr,
        );
      }
    }

    const responseBody: Record<string, unknown> = {
      reply: cleanReply,
      phase,
      showPhotoUploader,
      showSubmitDesignCta: shouldShowSubmitDesignCta({
        cleanReply,
        phase,
        advanceTowardSiteVisit,
        hasBudgetContext: intakeHasBudget,
        hasPhone: intakeHasPhone,
        hasCallWindow: intakeHasCallWindow,
      }),
      ...(responseImages.length ? { images: responseImages } : {}),
    };

    if (plannerDebugDiagnostics) {
      responseBody.debugHint = JSON.stringify({
        usedPlannerFallbackReply,
        phase,
        allowConceptImage,
        conceptImagesReturned: responseImages.length,
        plannerHarvestV1: plannerEnvFlagEnabled("PLANNER_HARVEST_V1"),
        plannerHarvestFullTranscript: plannerEnvFlagEnabled(
          "PLANNER_HARVEST_FULL_TRANSCRIPT",
        ),
        blockFirstRenderImage,
        simplifiedIntakeReady,
        refinementBaselineImages: refinementBaseParts.length,
      });
    }

    return NextResponse.json(responseBody, {
      ...(plannerDebugDiagnostics
        ? { headers: { "X-Planner-Diagnostic": "1" } }
        : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not generate project guidance right now." },
      { status: 500 },
    );
  }
}
