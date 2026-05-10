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
  hasEarlyPhotoInviteContext,
  hasNorthStarContext,
  hasRoughDimensions,
} from "@/lib/planner-intake-detect";
import {
  applyFullCarpenterPipeline,
  buildAdaptiveScaleInjection,
  buildExtractedVisualDirective,
  extractCeilingHeightFeetFromTranscript,
  inferDesignCategoryBucket,
  transcriptSuggestsCloset,
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

function buildPlannerSystemInstruction(params: {
  priorTurnHadConceptImage: boolean;
  sketchLikelyAfterReply: boolean;
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
    chunks.push(`
## Session hint (platform)
The platform **may** attach a concept sketch after this reply—either tied to their room photos or a **neutral blank-studio style** preview if they have not shared pictures. **Never** claim you created, rendered, or attached the image. Focus on **look and layout**. **Do not** mention retailers, SKUs, or prices. Ask one clear **question** about whether the direction feels close—not a statement ending.`);
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
The homeowner has signaled enough **work category** + **style direction** to invite pictures. Ask for clear photos of the space **on this turn or soon** when helpful — include \`[PHOTO_PROMPT]\` when you invite uploads. This **does not** mean a first concept sketch is coming yet; the platform only attaches the **first** rendering after photos, measurements, budget/contact intake, and their answer to the Phase 4 gate question.`);
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
## Session hint (required intake)
Before final handoff, ask for the best phone number to reach the homeowner.`);
  }
  if (!params.hasCallWindow) {
    chunks.push(`
## Session hint (required intake)
Before final handoff, ask what days/times are ideal for a callback (e.g. weekday evenings, mornings, etc.).`);
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
    const firstRenderUserConfirmed = userApprovedFirstRender(lastUserText);
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

    const sketchLikelyAfterReply =
      !pureEnthusiasmAfterSketch &&
      (userAttachedPhotosThisTurn ||
        (priorTurnHadConceptImage && hasUserMessage) ||
        likelyGenericBlankSketch);

    const latestImageParts = await loadLatestImageParts(imageFiles);
    const sketchReferenceParts = await loadLatestImageParts(sketchReferenceFiles);
    const conceptReferenceParts = [...sketchReferenceParts, ...latestImageParts];

    const contents = buildGeminiContents(messages, latestImageParts);
    if (!contents) {
      return NextResponse.json(
        { error: "Conversation must end with your latest message." },
        { status: 400 },
      );
    }

    let replyRaw = "";
    let plannerInlineImages: { mimeType: string; data: string }[] = [];

    try {
      if (isGeminiConfigured()) {
        const result = await geminiPlannerMultiTurn({
          systemInstruction: `${buildPlannerSystemInstruction({
            priorTurnHadConceptImage,
            sketchLikelyAfterReply,
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

        if (!("error" in result)) {
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
        }
      }
    } catch {
      replyRaw = "";
    }

    if (!replyRaw) {
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
        genericBlankSketchEligible);

    const responseImages: { mimeType: string; data: string }[] = [
      ...plannerInlineImages,
    ];

    let cleanReply = cleanReplyRaw;

    if (allowConceptImage && responseImages.length === 0) {
      const transcript = messages
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

      const basePrompt = `${transcript}\n\n${PLANNER_ASSISTANT_NAME} reply:\n${cleanReply.slice(0, 6000)}${exploratoryNote}`;
      const baseGoal =
        lastUserText.slice(0, 4000) || cleanReply.slice(0, 1200);

      const extractionTranscript = messages
        .slice(-VISUAL_EXTRACTION_MESSAGE_WINDOW)
        .map((m) => {
          const label = m.role === "user" ? "Homeowner" : PLANNER_ASSISTANT_NAME;
          const body =
            m.role === "assistant" ? stripPlannerPhaseMarkers(m.content) : m.content;
          return `${label}: ${body}`;
        })
        .join("\n");

      const hasUserProvidedPhoto =
        conceptReferenceParts.length > 0 || imageFiles.length > 0;
      const isClosetScope = transcriptSuggestsCloset(extractionTranscript);
      const ceilingFromTranscript =
        extractCeilingHeightFeetFromTranscript(extractionTranscript);

      let extractedVisualDirective = buildAdaptiveScaleInjection({
        hasUserProvidedPhoto,
        isCloset: isClosetScope,
        ceilingHeightFeet: ceilingFromTranscript,
        categoryBucket: inferDesignCategoryBucket(extractionTranscript),
      });
      try {
        const rawSpec = await geminiExtractPlannerVisualSpec(extractionTranscript);
        if (rawSpec) {
          const corrected = applyFullCarpenterPipeline(rawSpec, extractionTranscript);
          extractedVisualDirective = buildExtractedVisualDirective(corrected, {
            hasUserProvidedPhoto,
            isCloset: isClosetScope,
            extractionTranscript,
          });
        }
      } catch {
        /* extraction must not block visuals */
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        const visual = await geminiGenerateConceptImage({
          promptContext: basePrompt,
          userGoal:
            attempt === 0
              ? baseGoal
              : `${baseGoal}\n\n(Second attempt: output must include one clear IMAGE part showing the finish-carpentry concept.)`,
          referenceImageParts:
            conceptReferenceParts.length > 0 ? conceptReferenceParts : undefined,
          extractedVisualDirective,
        });

        if (!("error" in visual) && visual.images.length > 0) {
          for (const img of visual.images) {
            responseImages.push({ mimeType: img.mimeType, data: img.dataBase64 });
          }
          break;
        }
      }

      if (responseImages.length === 0) {
        cleanReply = stripMisleadingImageDeliveryClaims(cleanReply);
      }
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
            responseImages.length,
          ...(conceptImages.length ? { conceptImages } : {}),
        });
      } catch {
        /* Activity logging must not break planner responses */
      }
    }

    return NextResponse.json({
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
    });
  } catch {
    return NextResponse.json(
      { error: "Could not generate project guidance right now." },
      { status: 500 },
    );
  }
}
