import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
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
  assistantAskedFirstDesignGate,
  deriveNorthStarLabelsFromUserText,
  hasEarlyPhotoInviteContext,
  hasNorthStarContext,
  hasRoughDimensions,
} from "@/lib/planner-intake-detect";
import {
  applyHarvestSafetyCategoryFallbacks,
  buildFullPlannerTranscriptForHarvest,
  buildHarvestConceptPromptBundle,
  buildNorthStarGoalSummaryFromMessages,
  harvestPlannerImageContextFromTranscript,
  logHarvestAssumptions,
  type HarvestPromptVisualMode,
} from "@/lib/planner-image-context-harvest";
import {
  applyFullCarpenterPipeline,
  buildAdaptiveScaleInjection,
  buildExtractedVisualDirective,
  extractCeilingHeightFeetFromTranscript,
  inferDesignCategoryBucket,
  transcriptSuggestsCloset,
  type PlannerVisualSpec,
} from "@/lib/planner-visual-spec";
import { PLANNER_ASSISTANT_SYSTEM } from "@/lib/planner-assistant-prompt";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import { addClientSpacePhoto, appendAiPlannerActivity } from "@/lib/client-portal-store";

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

function userApprovedFirstRender(text: string): boolean {
  const raw = text.trim();
  const t = raw.toLowerCase();
  if (!t) return false;
  if (
    /\b(go ahead|proceed|please do|please create|you can create|you can go ahead)\b/.test(t)
  ) {
    return true;
  }
  if (
    /\b(nothing else|that'?s all|that'?s everything|no,? that'?s it|all set|no more to add)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(yes|yep|yeah|sure)[\s!.]*$/i.test(raw)) return true;
  if (/^(no|nope)[\s!.]*$/i.test(raw)) return true;
  return false;
}

/** Max length for treating latest message as a "contact completion" reply after Phase 4 gate. */
const MAX_CONTACT_ONLY_PHASE4_REPLY_CHARS = 520;

/**
 * Phase 4 gate cleared for first sketch: explicit approval phrases, or (after gate was asked)
 * a short message that completes phone + callback heuristics in the transcript.
 */
function firstRenderPhaseFourCleared(
  lastUserText: string,
  allUserText: string,
  messages: PlannerClientMessage[],
): boolean {
  if (userApprovedFirstRender(lastUserText)) return true;
  if (!assistantAskedFirstDesignGate(messages)) return false;
  if (!hasPhoneNumber(allUserText) || !hasCallWindow(allUserText)) return false;

  const raw = lastUserText.trim();
  if (!raw || raw.length > MAX_CONTACT_ONLY_PHASE4_REPLY_CHARS) return false;

  return hasPhoneNumber(lastUserText) || hasCallWindow(lastUserText);
}

function buildPlannerSystemInstruction(params: {
  priorTurnHadConceptImage: boolean;
  sketchLikelyAfterReply: boolean;
  /** True when the first concept image is blocked (intake / Phase 4 gate). */
  blockFirstRenderImage: boolean;
  userAttachedPhotosThisTurn: boolean;
  hasPhotoContextInSession: boolean;
  sketchRoundsDelivered: number;
  suggestInPersonAfterManySketches: boolean;
  advanceTowardSiteVisit: boolean;
  hasBudgetContext: boolean;
  hasPhone: boolean;
  hasCallWindow: boolean;
  firstRenderCheckMode: "none" | "ask_now" | "awaiting_user_confirmation";
  /** Category + style signals present — invite photos early; does not unlock first render. */
  northStarReadyForPhotoPrompt: boolean;
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
The **first** concept image is **not** being attached on this reply because intake or the Phase 4 confirmation is **not** complete yet. Do **not** say you created, generated, produced, attached, or showed a sketch or picture, and do **not** say they should see an image **below** this message — **there will not be one**. Continue with **short questions and prose guidance only** until the platform can attach a visualization.`);
    } else {
      chunks.push(`
## Session hint (platform)
The platform **may** attach a concept sketch after this reply—either tied to their room photos or a **neutral blank-studio style** preview if they have not shared pictures. **Never** claim you created, rendered, or attached the image. Focus on **look and layout**. **Do not** mention retailers, SKUs, or prices. Ask one clear **question** about whether the direction feels close—not a statement ending.`);
    }
  }

  if (params.userAttachedPhotosThisTurn) {
    chunks.push(`
## Phase 3 — Smart vision survey (photo just uploaded)
They attached **space / material photos**. Thank them briefly, then perform a **category-aware site survey** aligned with **Phase 1** (North Star):
- **Obstructions:** outlets, vents, switches that conflict with the install type you discussed.
- **Architecture:** trim, baseboards, ceiling character — tie observations to their **style** direction.
- **Removals:** ONLY ask about removing something **visible** in the image (e.g. wire rack); never invent off-photo clutter.
Stay concise; end with **one** sharp **question**. Prefer \`[PHASE:refine]\` when iterating visually after photos exist.`);
  }
  if (!params.hasPhotoContextInSession && params.northStarReadyForPhotoPrompt) {
    chunks.push(`
## Session hint (photo invite — early Phase 1)
The homeowner has signaled enough **work category** + **style direction** to invite pictures. Ask for clear photos of the space **on this turn or soon** when helpful — include \`[PHOTO_PROMPT]\` when you invite uploads. This **does not** mean a first concept sketch is coming yet; the platform only attaches the **first** rendering after photos, measurements, budget, and their answer to the Phase 4 gate question (phone/callback are for **handoff**, not that first attachment).`);
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

  if (!params.hasBudgetContext) {
    chunks.push(`
## Session hint (required intake)
Budget context is missing or unclear. Ask for a realistic budget target before deeper recommendations and tailor the direction to that budget.`);
  }
  if (!params.hasPhone) {
    chunks.push(`
## Session hint (proposal handoff — not a first-sketch gate)
Phone number is still missing for **Level Up’s follow-up after you’re happy with the direction**. Ask for the best number when natural — **do not** say the **first** AI concept sketch is withheld until they provide it; the platform does not use phone as a prerequisite for that first attachment.`);
  }
  if (!params.hasCallWindow) {
    chunks.push(`
## Session hint (proposal handoff — not a first-sketch gate)
Callback timing is still missing for **scheduling / follow-up**. Ask for ideal days or times when natural — **do not** say the **first** AI concept sketch is withheld until they provide it.`);
  }

  if (params.firstRenderCheckMode === "ask_now") {
    chunks.push(`
## Phase 4 — Rendering gate (required)
Do **NOT** generate or imply that a first image is ready or attached.
Ask **3–5 short follow-ups** mixing **Category A** (remaining survey: obstructions, architecture, adjacency) with **Category B** (final scope adds/removals).
Apply **spatial logic**: tallest vertical = Height; shorter horizontal = Depth; remaining horizontal = Width. Closets often ~24" deep — if numbers look swapped, clarify **before** the recap.
Include **one recap sentence** exactly in this template (fill brackets):  
"So we're looking at a [Style] [Category] that is [Width × Height × Depth], avoiding [Obstruction visible in photo if any], and [Removal only if they confirmed removing something visible]."
**THE GATE:** Your **final** question to the homeowner **must be verbatim**:  
"Is there anything else to consider before I create the first design idea for you?"`);
  } else if (params.firstRenderCheckMode === "awaiting_user_confirmation") {
    chunks.push(`
## Phase 4 — Rendering gate (required)
You already asked the gate question about considering anything else before the first design idea.
Do **NOT** repeat that exact question. If they confirm nothing else matters, proceed naturally; otherwise capture the missing detail first.
If they correct dimensions, restate **Width × Height × Depth** using spatial logic before moving on.`);
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
    const intakeHasBudget = hasBudgetContext(allUserText);
    const intakeHasPhone = hasPhoneNumber(allUserText);
    const intakeHasCallWindow = hasCallWindow(allUserText);
    const northStarReadyForPhotoPrompt = hasEarlyPhotoInviteContext(allUserText);

    if (!lastUserText && imageFiles.length === 0) {
      return NextResponse.json(
        { error: "Add a message or attach at least one photo." },
        { status: 400 },
      );
    }

    const userAttachedPhotosThisTurn = imageFiles.length > 0;
    const hasPhotoContextInSession =
      userAttachedPhotosThisTurn || sketchReferenceFiles.length > 0;
    const hasAnyPriorRender =
      sketchRoundsDelivered > 0 || priorTurnHadConceptImage;
    const allUserTextLower = allUserText.toLowerCase();
    const eligibleForFirstRenderGate =
      hasNorthStarContext(allUserTextLower) &&
      hasRoughDimensions(allUserTextLower) &&
      intakeHasBudget &&
      hasPhotoContextInSession;
    const askedFirstRenderCheck = assistantAskedFirstDesignGate(messages);
    const firstRenderUserConfirmed = firstRenderPhaseFourCleared(
      lastUserText,
      allUserText,
      messages,
    );
    const firstRenderCheckMode: "none" | "ask_now" | "awaiting_user_confirmation" =
      hasAnyPriorRender
        ? "none"
        : !eligibleForFirstRenderGate
          ? "none"
          : askedFirstRenderCheck
            ? firstRenderUserConfirmed
              ? "none"
              : "awaiting_user_confirmation"
            : "ask_now";
    /** First concept image only after Phase 1–3 intake + Phase 4 homeowner confirmation. */
    const blockFirstRenderImage =
      !hasAnyPriorRender &&
      (!eligibleForFirstRenderGate || firstRenderCheckMode !== "none");

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

    const conceptReferenceParts = [...sketchReferenceParts, ...latestImageParts];
    /** Prior concept first (delta baseline), then space uploads — image model order. */
    const combinedConceptReferenceParts = [
      ...refinementBaseParts,
      ...conceptReferenceParts,
    ];

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
            firstRenderCheckMode,
            northStarReadyForPhotoPrompt,
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

    const { cleanReply: cleanReplyRaw, phase, showPhotoUploader } =
      extractPlannerPhase(replyForPhase);

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

      const specTranscript =
        plannerHarvestFullExtract && cappedFullHarvestTranscript.length > 0
          ? cappedFullHarvestTranscript
          : extractionWindowTranscript;

      const hasUserProvidedPhoto =
        combinedConceptReferenceParts.length > 0 || imageFiles.length > 0;
      const isClosetScope = transcriptSuggestsCloset(specTranscript);
      const ceilingFromTranscript =
        extractCeilingHeightFeetFromTranscript(specTranscript);

      let extractedVisualDirective = buildAdaptiveScaleInjection({
        hasUserProvidedPhoto,
        isCloset: isClosetScope,
        ceilingHeightFeet: ceilingFromTranscript,
        categoryBucket: inferDesignCategoryBucket(specTranscript),
      });

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
          const corrected = applyFullCarpenterPipeline(rawSpec, specTranscript);
          extractedVisualDirective = buildExtractedVisualDirective(corrected, {
            hasUserProvidedPhoto,
            isCloset: isClosetScope,
            extractionTranscript: specTranscript,
          });
        }
      } else {
        const correctedSpec = rawSpec
          ? applyFullCarpenterPipeline(rawSpec, specTranscript)
          : null;
        const { workCategory } = deriveNorthStarLabelsFromUserText(allUserText);
        const northStarGoalSummary = buildNorthStarGoalSummaryFromMessages(messages);

        const hasSpaceReference = conceptReferenceParts.length > 0;
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

        const harvestSourceTranscript =
          plannerHarvestFullExtract && cappedFullHarvestTranscript.length > 0
            ? cappedFullHarvestTranscript
            : extractionWindowTranscript;

        let harvest = harvestPlannerImageContextFromTranscript({
          extractionTranscript: harvestSourceTranscript,
          baseSpec: correctedSpec,
        });
        harvest = applyHarvestSafetyCategoryFallbacks(harvest, workCategory);
        logHarvestAssumptions("harvest", harvest.assumptionsLogged);

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
          });
          basePrompt = `${bundle.promptContext}\n\n--- Conversation excerpt ---\n\n${transcriptRecent}\n\n${PLANNER_ASSISTANT_NAME} reply:\n${cleanReply.slice(0, 6000)}${exploratoryNote}`;
          baseGoal = bundle.userGoal;
        }
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        const visual = await geminiGenerateConceptImage({
          promptContext: basePrompt,
          userGoal:
            attempt === 0
              ? baseGoal
              : `${baseGoal}\n\n(Second attempt: output must include one clear IMAGE part showing the finish-carpentry concept.)`,
          referenceImageParts:
            combinedConceptReferenceParts.length > 0
              ? combinedConceptReferenceParts
              : undefined,
          extractedVisualDirective,
        });

        if (!("error" in visual) && visual.images.length > 0) {
          for (const img of visual.images) {
            responseImages.push({ mimeType: img.mimeType, data: img.dataBase64 });
          }
          break;
        }
        if ("error" in visual) {
          console.warn(
            "[project-assistant] geminiGenerateConceptImage error:",
            visual.error,
          );
        } else if (visual.images.length === 0) {
          console.warn(
            "[project-assistant] geminiGenerateConceptImage returned no image parts",
          );
        }
      }

    }

    if (responseImages.length === 0) {
      cleanReply = stripMisleadingImageDeliveryClaims(cleanReply);
    }

    const portalSession = await getSessionFromCookie();
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
        await appendAiPlannerActivity(portalSession.userId, {
          promptPreview: lastUserText.slice(0, 280) || "(photo)",
          replyPreview: cleanReply.slice(0, 480),
          intakeSummary: `phase:${phase};turns:${messages.length}`,
          imageCount:
            imageFiles.length +
            sketchReferenceFiles.length +
            (refinementBaseFile ? 1 : 0) +
            responseImages.length,
          ...(conceptImages.length ? { conceptImages } : {}),
        });
      } catch {
        /* Activity logging must not break planner responses */
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
        eligibleForFirstRenderGate,
        firstRenderCheckMode,
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
