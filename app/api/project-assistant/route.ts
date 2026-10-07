import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  buildGeminiConceptImagePromptText,
  defaultGeminiImageModel,
  geminiCountShelvesInImage,
  geminiExtractPlannerVisualSpec,
  geminiGenerateConceptImage,
  geminiPlannerMultiTurn,
  homeownerPureEnthusiasmAfterSketch,
  homeownerSignalsHappyOrReady,
  isGeminiConfigured,
} from "@/lib/gemini-client";
import {
  extractPlannerPhase,
  extractWallLabels,
  stripMisleadingImageDeliveryClaims,
  stripPlannerPhaseMarkers,
  type PlannerPhaseTag,
} from "@/lib/planner-phase-utils";
import { buildPlannerFloorPlan } from "@/lib/planner-floor-plan";
import {
  deriveNorthStarLabelsFromUserText,
  evaluateSimplifiedIntakeReadiness,
  hasBudgetContextInText,
  hasEarlyPhotoInviteContext,
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
  buildImageRenderDirective,
  emptyPlannerVisualSpec,
  type ImageRenderDirectiveMode,
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
  appendPortalCommunication,
  getPortalSpacePhotoInlineParts,
  getPortalUserById,
  recordScheduledCall,
  setPortalUserProjectPhase,
} from "@/lib/client-portal-store";
import {
  extractPhoneNumber,
  mentionsVagueTiming,
  parseCallWindow,
  SALES_PIPELINE_PHASES,
} from "@/lib/planner-sales-handoff";
import { replicateConceptProviderEnabled } from "@/lib/replicate-sdxl-controlnet-concept";
import {
  appendSketchNotUpdatedNotice,
  appendVisualizationUnavailableNotice,
} from "@/lib/planner-render-outcome-messages";
import {
  applyRefinementGeometryToSpec,
  buildRefinementFeedbackBlob,
  detectRefinementGeometryIntent,
  EMPTY_REFINEMENT_GEOMETRY_INTENT,
  syncHarvestFromSpec,
  type RefinementGeometryIntent,
} from "@/lib/planner-refinement-geometry";
import {
  buildPlannerSchematicGuide,
  buildSchematicBindingDirective,
} from "@/lib/planner-schematic-guide";
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

/**
 * Refinement turns: only re-render when the message actually asks for a
 * visual change. Previously EVERY message after the first sketch triggered
 * a full re-render (even "thanks" or "what's the price"), which produced
 * surprise images and wasted generation calls.
 */
function messageRequestsVisualChange(
  text: string,
  intent: RefinementGeometryIntent,
): boolean {
  if (intent.hasGeometryChange) return true;
  const t = text.toLowerCase();
  // Explicit render requests ("show me what it would look like", "render another version").
  if (
    /\b(show|render|generate|draw|sketch|visualiz|visualis)\b/i.test(t) &&
    /\b(me|it|this|that|how|what|another|new|updated|revised|option|version|idea)\b/i.test(t)
  ) {
    return true;
  }
  if (/\bwhat\s+(would|will)\s+it\s+look\s+like\b/i.test(t)) return true;
  // Add / remove / swap element requests.
  if (
    /\b(add|remove|eliminate|get\s+rid\s+of|taking\s+out|take\s+out|another|extra|instead|rather|prefer|change\s+it|different\s+look)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // Negative visual feedback ("too big", "looks off", "hate the color").
  if (
    /\btoo\s+(big|small|long|short|high|low|dark|light|wide|narrow|deep|tall)\b/i.test(t) ||
    /\blooks\s+(bad|weird|off|wrong)\b/i.test(t) ||
    /\b(don't|dont|do\s+not)\s+like\b/i.test(t) ||
    /\bhate\b/i.test(t)
  ) {
    return true;
  }
  // Finish / color-only changes the geometry detector classifies as non-geometry.
  if (
    /\b(color|colour|paint|stain|finish|white|black|walnut|oak|natural)\b/i.test(t) &&
    /\b(change|make|try|darker|lighter)\b/i.test(t)
  ) {
    return true;
  }
  // Correction phrasing with dimensions ("should be one foot long", "make them 12 inches").
  // If the user states specific measurements, they're correcting the visual.
  if (
    /\b(should\s+be|make\s+(them|it)|each\s+(shelf|one))\b/i.test(t) &&
    /\b(\d+\s*(?:inch|inches|foot|feet|ft|cm|mm)|one\s+foot|two\s+feet)\b/i.test(t)
  ) {
    return true;
  }
  // User providing NEW design information (answering the planner's questions).
  // Style preferences, depth choices, purpose — these are visual details that
  // should trigger an updated render, not just more chat.
  if (
    /\b(modern|traditional|contemporary|rustic|minimalist|clean\s+look|classic)\b/i.test(t) &&
    /\b(style|look|feel|vibe|prefer|like)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(\d+\s*(?:inch|inches|")\s*deep|deep\s+enough)\b/i.test(t)
  ) {
    return true;
  }
  // Short affirmative answers that confirm the planner's summary
  // ("yes", "that's right", "looks good") after a spec confirmation
  // mean "proceed with this design" — generate the visual.
  if (
    /^(yes|yeah|yep|yup|correct|that's\s+right|looks\s+good|sounds\s+good|perfect)\.?$/i.test(t.trim())
  ) {
    return true;
  }
  // Count changes ("make it 3 shelves", "just do 3", "actually make it 2").
  // The user is revising the quantity — this needs a new visual.
  if (
    /\b(make\s+it|just\s+do|actually\s+make\s+it|change\s+it\s+to)\s+(2|3|4|5|6)\b/i.test(t) ||
    /\b(2|3|4|5|6)\s+shelves?\b/i.test(t)
  ) {
    return true;
  }
  // Directional repositioning ("move them up", "shift it left", "move down a bit").
  // The user is adjusting placement — this needs a new visual.
  if (
    /\b(move|shift|slide|nudge)\b/i.test(t) &&
    /\b(up|down|left|right|higher|lower|over)\b/i.test(t)
  ) {
    return true;
  }
  // Resize commands ("make them bigger", "make it smaller", "wider", "narrower").
  if (
    /\b(make|get)\b.*\b(bigger|smaller|wider|narrower|longer|shorter|taller)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Persist AI-generated concept images for admin CRM (bounded size).
 * Downscales to a compact JPEG so the CRM copy always fits the persist caps —
 * the shop packet uses it as design intent only, never as dimensional truth. */
async function conceptImagesForAdminCrm(
  responseImages: { mimeType: string; data: string }[],
): Promise<Array<{ mimeType: string; dataUrl: string }>> {
  const MAX_IMAGES = 3;
  const MAX_PER_DATA_URL = 480_000;
  const MAX_COMBINED = 1_200_000;

  const out: Array<{ mimeType: string; dataUrl: string }> = [];
  let combined = 0;
  for (const img of responseImages.slice(0, MAX_IMAGES)) {
    let data = (img.data || "").trim();
    let mime = "image/jpeg";
    try {
      const buf = await sharp(Buffer.from(data, "base64"))
        .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
      data = buf.toString("base64");
    } catch {
      // If the bytes can't be decoded, fall back to the original payload when it fits.
      mime = (img.mimeType || "image/png").trim() || "image/png";
    }
    const dataUrl = `data:${mime};base64,${data}`;
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
  /** Sales-handoff directive for Alex (book the callback); null when inactive. */
  salesHandoffHint: string | null;
  hasBudgetContext: boolean;
  hasPhone: boolean;
  hasCallWindow: boolean;
  /** Category + style signals present — invite photos early. */
  northStarReadyForPhotoPrompt: boolean;
  /** Photos + type + budget + style + rough dimensions present in chat. */
  simplifiedIntakeReady: boolean;
  /** Optional multimodal vision hints for this turn’s uploads — not measurements. */
  roomPhotoHintsBlock?: string;
  /** Number of space photos the homeowner attached this turn. */
  uploadedPhotoCount?: number;
  /** Space photos already in the portal session (across turns). */
  sessionPhotoCount?: number;
  /** Wall labels already confirmed via [WALLS:…] markers (empty when unlabeled). */
  wallLabelsPreReply?: string[];
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
The **first** concept image is **not** being attached on this reply because the homeowner hasn't said what they want built yet. Do **not** say you created, generated, produced, attached, or showed a sketch or picture, and do **not** say they should see an image **below** this message — **there will not be one**. Ask **one clear question** about what they want for this space (e.g. "What are you hoping to add or change here — more storage, a new workbench setup, wall organization, or something else?"). Do not run a questionnaire. Budget, style, and dimensions can be collected **after** they tell you the project direction and react to the first visual.`);
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

  const uploadedCount = params.uploadedPhotoCount ?? 0;
  const labeledWalls = params.wallLabelsPreReply ?? [];
  if (uploadedCount >= 2 && labeledWalls.length === 0) {
    chunks.push(`
## Multi-wall labeling (REQUIRED this turn)
The homeowner uploaded **${uploadedCount} space photos** — likely different walls of the same room (kitchen, walk-in closet). Do **not** design yet. Instead, briefly describe each photo (1–2 lines, using the photo summaries above) and ask which wall each one shows — e.g. "Which photo is the back wall, and which is the left?". Keep it to one short question. Do **not** emit a [WALLS:…] marker until the homeowner confirms the labels.`);
  } else if (labeledWalls.length >= 2) {
    chunks.push(`
## Multi-wall session (labeled walls)
This room has **${labeledWalls.length} labeled walls**: ${labeledWalls.map((w, i) => `Photo ${i + 1} = ${w}`).join("; ")}. The platform renders one concept image per labeled wall. In your reply, summarize the design **per wall** (one short line each) so the whole-room plan is clear. Keep finishes, materials, and hardware **identical across all walls** unless the homeowner explicitly asked a wall to differ.`);
  } else if (
    uploadedCount === 0 &&
    (params.sessionPhotoCount ?? 0) >= 2
  ) {
    // The homeowner uploaded multiple photos on an earlier turn but never
    // labeled them — check whether this turn's message does.
    chunks.push(`
## Multi-wall labeling (check this turn)
The homeowner previously uploaded multiple space photos without saying which wall each shows. If their latest message labels the walls (e.g. "first is the back wall, second is the left"), confirm the mapping back briefly and emit a single marker line on its own line: \`[WALLS: back wall | left wall]\` — one label per photo, in upload order, separated by " | ". This marker is stripped before display; it tells the platform to render one concept per wall. Do not emit it until the homeowner has actually labeled the walls.`);
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

  if (params.salesHandoffHint) {
    chunks.push(params.salesHandoffHint);
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

  if (params.hasBudgetContext) {
    chunks.push(`
## Session hint (budget already known — DO NOT ASK AGAIN)
The homeowner has ALREADY discussed budget. Do NOT ask about budget, price range, spending, or "how much" in any form. Not directly, not indirectly, not in different words. Move on to design questions.`);
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
## Session hint (first visual going out now)
A concept sketch is being attached after this reply. Keep your text short — point at one thing in the visual and ask a single reaction question (e.g. "Does that shelf height feel right, or should it sit lower?"). Do **not** ask a batch of intake questions here; collect budget, style, and dimensions one at a time as follow-ups to the visual.`);
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
  const priorAssistant = recent
    .filter((m) => m.role === "assistant")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const userMentionedBudget =
    /\$+\s*\d/.test(priorUser) ||
    /\b\d+\s*k\b/i.test(priorUser) ||
    priorUser.includes("budget") ||
    priorUser.includes("investment") ||
    priorUser.includes("spend");
  // If the AI already asked about budget, treat it as "known" to prevent
  // the backend from telling the AI to ask again in a loop.
  const aiAlreadyAskedBudget =
    priorAssistant.includes("budget") ||
    priorAssistant.includes("how much") ||
    priorAssistant.includes("spend") ||
    priorAssistant.includes("price range");
  const hasBudgetContext = userMentionedBudget || aiAlreadyAskedBudget;
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
    if (!params.hasPhotoContextInSession) {
      return "First render blocked: need a photo of the space or a clear description of what the homeowner wants added.";
    }
    return "First render blocked: no project-type signal in chat yet (could not tell what the homeowner wants built).";
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
    const allAssistantText = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n")
      .toLowerCase();
    // If the AI already asked about budget, treat it as known so the prompt
    // builder emits "DO NOT ASK AGAIN" instead of "budget missing, ask!".
    const aiAlreadyAskedBudget =
      allAssistantText.includes("budget") ||
      allAssistantText.includes("how much") ||
      allAssistantText.includes("spend") ||
      allAssistantText.includes("price range");
    const intakeHasBudget =
      hasBudgetContextInText(allUserText) || aiAlreadyAskedBudget;
    const intakeHasPhone = hasPhoneNumber(allUserText);
    const intakeHasCallWindow = hasCallWindow(allUserText);
    const northStarReadyForPhotoPrompt = hasEarlyPhotoInviteContext(allUserText);
    const intakeDiagnostics = evaluateSimplifiedIntakeReadiness(messages);
    const simplifiedIntakeReady = intakeDiagnostics.ready;

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
    const trimmedUser = lastUserText.trim();
    const hasUserMessage = trimmedUser.length > 0;
    const substantiveForGenericSketch =
      trimmedUser.length >= MIN_USER_CHARS_FOR_GENERIC_SKETCH;

    const hasAnyPriorRender =
      sketchRoundsDelivered > 0 || priorTurnHadConceptImage;
    /**
     * First render gate: photo(s) + the homeowner EXPLICITLY stating what they
     * want (a category signal like "shelves"/"closet" in their own words) is
     * enough for a first draft. A photo with only vague text is NOT enough —
     * the planner must ask what they want first, not guess and render.
     * Style, budget, and dimensions still get collected — but as reactions to
     * the visual, not as a questionnaire blocking it.
     * No-photo users with a substantive description + explicit category render
     * in a neutral studio room instead of being blocked forever.
     */
    const firstRenderMinimalReady = Boolean(intakeDiagnostics.category);
    const blockFirstRenderImage =
      !hasAnyPriorRender && !firstRenderMinimalReady;

    const pureEnthusiasmAfterSketch =
      priorTurnHadConceptImage &&
      !userAttachedPhotosThisTurn &&
      homeownerPureEnthusiasmAfterSketch(lastUserText);

    const advanceTowardSiteVisit =
      homeownerSignalsHappyOrReady(lastUserText) &&
      (clientPhase === "recommend" ||
        clientPhase === "refine" ||
        priorTurnHadConceptImage);

    // --- Sales handoff: liked design -> book a consultation call, move the
    // profile through the CRM pipeline in the background.
    const handoffPortalUserId = portalSession?.userId ?? null;
    const callTimeCandidate = parseCallWindow(lastUserText);
    const callTimingVague = !callTimeCandidate && mentionsVagueTiming(lastUserText);
    let handoffCurrentPhase: string | null = null;
    let handoffPortalPhone = "";
    let handoffExistingCalls: Array<{ scheduledFor: string; status: string }> = [];
    if (
      handoffPortalUserId &&
      (advanceTowardSiteVisit || callTimeCandidate || callTimingVague)
    ) {
      try {
        const handoffUser = await getPortalUserById(handoffPortalUserId);
        handoffCurrentPhase = handoffUser?.projectStatus?.phase ?? null;
        handoffPortalPhone = handoffUser?.phone ?? "";
        handoffExistingCalls = (handoffUser?.scheduledCalls ?? []).map((c) => ({
          scheduledFor: c.scheduledFor,
          status: c.status,
        }));
      } catch (phaseErr) {
        console.warn(
          "[project-assistant] sales handoff profile lookup failed:",
          phaseErr instanceof Error ? phaseErr.message : phaseErr,
        );
      }
    }
    const handoffInPipeline =
      handoffCurrentPhase === SALES_PIPELINE_PHASES.designApproved ||
      handoffCurrentPhase === SALES_PIPELINE_PHASES.callScheduled;
    const salesHandoffActive = advanceTowardSiteVisit || handoffInPipeline;

    let salesHandoffHint: string | null = null;
    let pendingScheduledCall: {
      scheduledFor: Date;
      label: string;
      phone: string;
    } | null = null;
    if (salesHandoffActive) {
      if (!handoffPortalUserId) {
        salesHandoffHint = `## Session hint (sales handoff — guest)
The homeowner likes the design direction and is ready to move forward, but they are not signed in. Warmly explain that a free Level Up account saves their project and lets Tom schedule a callback to discuss it — ask if they'd like to create one, in a single short question. Do not mention CRM, pipelines, or internal stages.`;
      } else if (callTimeCandidate) {
        const phoneDigits =
          extractPhoneNumber(lastUserText) ??
          extractPhoneNumber(allUserText) ??
          (handoffPortalPhone.trim() ? handoffPortalPhone.trim() : null);
        if (phoneDigits) {
          const alreadyBooked = handoffExistingCalls.some(
            (c) =>
              c.status === "scheduled" &&
              c.scheduledFor === callTimeCandidate.scheduledFor.toISOString(),
          );
          if (!alreadyBooked) {
            pendingScheduledCall = {
              scheduledFor: callTimeCandidate.scheduledFor,
              label: callTimeCandidate.label,
              phone: phoneDigits,
            };
          }
          salesHandoffHint = `## Session hint (sales handoff — call confirmed)
The homeowner agreed to a callback: **${callTimeCandidate.label}** at **${phoneDigits}**. The platform has saved it. Confirm warmly in one or two sentences (e.g. "You're all set — Tom will call you ${callTimeCandidate.label} at ${phoneDigits} to talk through the project."). Do NOT ask for a time or number again. Do not mention CRM, pipelines, or internal stages.`;
        } else {
          salesHandoffHint = `## Session hint (sales handoff — time given, need number)
The homeowner suggested **${callTimeCandidate.label}** for a callback with Tom. Confirm that time works, then ask for the best phone number to reach them at — one short question, nothing else. Do not mention CRM, pipelines, or internal stages.`;
        }
      } else if (callTimingVague) {
        salesHandoffHint = `## Session hint (sales handoff — pin down a time)
The homeowner is open to a callback but was vague about timing. Ask for one specific day and time that works for a quick call with Tom (e.g. "What day and time works best — say Tuesday afternoon?"). One short question. Do not mention CRM, pipelines, or internal stages.`;
      } else {
        salesHandoffHint = `## Session hint (sales handoff — book the call)
The homeowner likes the design direction — pivot to booking. In one or two warm sentences say Tom would love to talk through the project with them, then ask what day and time works best for a quick call. One question only; do not ask for the phone number yet. Do not mention CRM, pipelines, or internal stages.`;
      }
    }

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
     * Refinement: room/space photos first, prior concept render LAST (matches harvest + image prompt text).
     * First render: space photos only (no baseline yet).
     */
    const refinementWithBaseline =
      (sketchRoundsDelivered > 0 || priorTurnHadConceptImage) &&
      refinementBaseParts.length > 0;
    const combinedConceptReferenceParts = refinementWithBaseline
      ? [...conceptReferenceParts, ...refinementBaseParts]
      : [...conceptReferenceParts];

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

    /**
     * Lightweight visual-change signal from the user's text alone. (The
     * full geometry intent, which also folds in Alex's reply summary, is
     * computed later for the actual render.)
     */
    const gatingIntent = detectRefinementGeometryIntent(lastUserText.trim());
    const wantsVisualThisTurn = !hasAnyPriorRender
      ? firstRenderMinimalReady
      : userAttachedPhotosThisTurn ||
        messageRequestsVisualChange(lastUserText, gatingIntent);

    /**
     * Multi-wall: wall labels already confirmed in the transcript (via
     * `[WALLS: ...]` markers Alex emitted on earlier turns). Used to decide
     * whether to ask for labeling and whether to block the render.
     */
    const wallLabelsPreReply = extractWallLabels(
      messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n"),
    );

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
            salesHandoffHint,
            hasBudgetContext: intakeHasBudget,
            hasPhone: intakeHasPhone,
            hasCallWindow: intakeHasCallWindow,
            simplifiedIntakeReady,
            northStarReadyForPhotoPrompt,
            uploadedPhotoCount: imageFiles.length,
            sessionPhotoCount:
              portalSpacePhotoParts.length + sketchReferenceFiles.length,
            wallLabelsPreReply,
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
          if (blockFirstRenderImage || !wantsVisualThisTurn) {
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

    /**
     * Multi-wall: wall labels effective this turn = prior transcript labels,
     * overridden by any [WALLS:…] marker Alex just emitted in this reply.
     * Photo source: this turn's uploads first, else the portal session photos
     * (chronological = upload order, so wall i ↔ photo i).
     */
    const wallLabelsThisTurn = extractWallLabels(replyForPhase);
    const wallLabelsEffective =
      wallLabelsThisTurn.length > 0 ? wallLabelsThisTurn : wallLabelsPreReply;
    const multiWallPhotoSource =
      latestImageParts.length >= 2
        ? latestImageParts
        : sketchReferenceParts.length >= 2
          ? sketchReferenceParts
          : portalSpacePhotoParts.length >= 2
            ? portalSpacePhotoParts
            : [];
    const multiWallCount = Math.min(
      wallLabelsEffective.length,
      multiWallPhotoSource.length,
    );
    // Multi-wall loop only for first renders (MVP) — refinements keep the
    // existing single-render path.
    const isMultiWallRender =
      multiWallCount >= 2 &&
      !hasAnyPriorRender;

    const allowConceptImage =
      isGeminiConfigured() &&
      plannerInlineImages.length === 0 &&
      !blockFirstRenderImage &&
      !pureEnthusiasmAfterSketch &&
      hasUserMessage &&
      wantsVisualThisTurn &&
      // Multi-wall: don't render a confused single image from 2+ unlabeled
      // photos — wait until the homeowner labels each wall.
      !(userAttachedPhotosThisTurn && imageFiles.length >= 2 && wallLabelsPreReply.length < 2);

    const responseImages: { mimeType: string; data: string; caption?: string }[] = [
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

      // Keep the image prompt focused: the model works best with a clear, direct
      // request (like the Gemini App) — not a wall of transcript. Lead with what
      // the user actually asked for, not 12 messages of back-and-forth.
      let basePrompt = `Homeowner request: ${lastUserText.slice(0, 2000)}${exploratoryNote}`;
      let baseGoal =
        lastUserText.slice(0, 4000) || cleanReply.slice(0, 1200);
      let conceptImageVisualMode: ImageRenderDirectiveMode =
        hasAnyPriorRender && refinementBaseParts.length > 0
          ? "refinement-delta"
          : "first-render";

      let refinementGeometryIntent: RefinementGeometryIntent =
        EMPTY_REFINEMENT_GEOMETRY_INTENT;

      if (!plannerHarvestV1) {
        if (rawSpec) {
          const corrected = mergePlannerFixtureCounts(
            applyFullCarpenterPipeline(rawSpec, specTranscript),
            specTranscript,
          );
          conceptRenderSpec = corrected;
          if (conceptImageVisualMode === "refinement-delta") {
            const refinementBlob = buildRefinementFeedbackBlob(
              lastUserText,
              cleanReply,
            );
            refinementGeometryIntent =
              detectRefinementGeometryIntent(refinementBlob);
            if (refinementGeometryIntent.hasGeometryChange) {
              conceptRenderSpec = applyRefinementGeometryToSpec(
                corrected,
                refinementBlob,
                refinementGeometryIntent,
              );
            }
          }
          extractedVisualDirective = buildImageRenderDirective(
            conceptRenderSpec,
            {
              hasUserProvidedPhoto,
              isCloset: isClosetScope,
              extractionTranscript: specTranscript,
            },
            conceptImageVisualMode,
            { geometryRefinement: refinementGeometryIntent.hasGeometryChange },
          );
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
        conceptImageVisualMode = visualMode;

        let harvest = harvestPlannerImageContextFromTranscript({
          extractionTranscript: harvestExtractionTranscript,
          baseSpec: correctedSpec,
        });
        harvest = applyHarvestSafetyCategoryFallbacks(harvest, effectiveWorkCategory, {
          transcriptForDimFallback: harvestExtractionTranscript,
        });
        logHarvestAssumptions("harvest", harvest.assumptionsLogged);

        if (visualMode === "refinement-delta") {
          const refinementBlob = buildRefinementFeedbackBlob(
            lastUserText,
            cleanReply,
          );
          refinementGeometryIntent =
            detectRefinementGeometryIntent(refinementBlob);
          if (refinementGeometryIntent.hasGeometryChange) {
            const adjustedSpec = applyRefinementGeometryToSpec(
              harvest.spec,
              refinementBlob,
              refinementGeometryIntent,
            );
            harvest = syncHarvestFromSpec(harvest, adjustedSpec);
          }
        }

        conceptRenderSpec = harvest.spec;
        extractedVisualDirective = buildImageRenderDirective(
          harvest.spec,
          {
            hasUserProvidedPhoto,
            isCloset: isClosetScope,
            extractionTranscript: specTranscript,
          },
          visualMode,
          { geometryRefinement: refinementGeometryIntent.hasGeometryChange },
        );

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
            refinementGeometryIntent,
          });
          if (visualMode === "refinement-delta") {
            basePrompt = bundle.promptContext;
          } else {
            basePrompt = `${bundle.promptContext}${exploratoryNote}`;
          }
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

      /**
       * Deterministic layout schematic (code-drawn, cannot miscount): the
       * image model copies its shelf count / spans / positions instead of
       * inventing them. Attached FIRST so the LAST reference image stays
       * the prior concept render in refinement mode.
       */
      let schematicReferencePart:
        | { inline_data: { mime_type: string; data: string } }
        | null = null;
      if (conceptRenderSpec) {
        const schematic = await buildPlannerSchematicGuide(
          conceptRenderSpec,
          refinementGeometryIntent.hasGeometryChange
            ? refinementGeometryIntent
            : null,
        );
        if (schematic) {
          schematicReferencePart = {
            inline_data: { mime_type: "image/png", data: schematic.dataBase64 },
          };
          extractedVisualDirective =
            `${extractedVisualDirective}\n\n${buildSchematicBindingDirective(schematic.shelfCount)}`;
        }
      }

      /**
       * Refinement fidelity: the model tends to recompose the whole scene
       * instead of editing. Constrain it to a surgical edit of the baseline.
       */
      if (conceptImageVisualMode === "refinement-delta") {
        extractedVisualDirective =
          `${extractedVisualDirective}\n\nSURGICAL EDIT (this is an edit of the prior concept render, NOT a new composition):\n` +
          "- Start from the LAST reference image (the prior concept render) and change ONLY what the homeowner asked to change.\n" +
          "- Keep identical: the room, walls, flooring, ceiling, lighting, camera angle, colors, materials, finishes, and every element the request did not mention.\n" +
          '- Do not restyle, recolor, recompose, or "improve" the scene. Do not add or remove furniture, decor, or fixtures beyond the request.\n' +
          "- The only allowed visible difference is the requested change itself (the geometry TARGET above still applies to that change).";
      }

      const conceptReferencePartsForRender = schematicReferencePart
        ? [schematicReferencePart, ...combinedConceptReferenceParts]
        : [...combinedConceptReferenceParts];
      const conceptReferenceForRender =
        conceptReferencePartsForRender.length > 0
          ? conceptReferencePartsForRender
          : undefined;

      console.log("--- RENDERING START (Gemini) ---");
      console.log("Target Dimensions:", harvestedDimensions);
      console.log("Scale Anchors Used:", categoryAnchors);

      let conceptRenderAudit: ConceptRenderAudit | undefined;

      /**
       * One full render pass (up to 4 attempts: the image model sometimes
       * returns text-only). extraGoalSuffix lets the accuracy-correction
       * pass demand a fixed shelf count. referencePartsOverride swaps the
       * reference photos (multi-wall: one wall's photo only). Returns the
       * images plus the failure detail for the reply / audit trail.
       */
      const runOneRender = async (
        extraGoalSuffix: string,
        referencePartsOverride?: typeof conceptReferenceForRender,
      ): Promise<{
        images: Array<{ mimeType: string; dataBase64: string }>;
        failureDetail: string | null;
      }> => {
        const out: Array<{ mimeType: string; dataBase64: string }> = [];
        let failure: string | null = null;
        let prevOkNoImages = false;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt >= 1 && prevOkNoImages) {
            await new Promise((r) =>
              setTimeout(r, attempt === 1 ? 800 : attempt === 2 ? 1400 : 2000),
            );
          }
          prevOkNoImages = false;

          const geometryRetryHint =
            refinementGeometryIntent.hasGeometryChange && attempt >= 1
              ? "\n\n(The shelf size or position must be visibly different from the baseline image — not a duplicate.)"
              : "";

          // Direct horizontal layout override: if the user explicitly asked for
          // side-by-side/same-level, inject an unmissable instruction. The visual
          // spec pipeline defaults to vertical tiers, so this bypasses it.
          const wantsHorizontalRowDirect =
            /\b(side\s+by\s+side|same\s+level|in\s+a\s+row|horizontally\s+aligned|horizontal\s+row|all\s+in\s+a\s+row)\b/i.test(
              lastUserText,
            );
          const horizontalLayoutOverride = wantsHorizontalRowDirect
            ? "\n\nCRITICAL LAYOUT: Draw the shelves in ONE HORIZONTAL ROW — all at the SAME HEIGHT, SIDE BY SIDE. Do NOT stack them vertically. Do NOT arrange them in tiers."
            : "";

          const userGoalAug =
            attempt === 0
              ? `${baseGoal}${horizontalLayoutOverride}${extraGoalSuffix}`
              : attempt === 1
                ? `${baseGoal}\n\n(Second attempt: output must include one clear IMAGE part showing the finish-carpentry concept.)${geometryRetryHint}${horizontalLayoutOverride}${extraGoalSuffix}`
                : attempt === 2
                  ? `${baseGoal}\n\n(Third attempt: mandatory — emit at least one IMAGE part; no text-only replies; prioritize a single clear finish-carpentry concept render.)${geometryRetryHint}${horizontalLayoutOverride}${extraGoalSuffix}`
                  : `${baseGoal}\n\n(Fourth attempt: you MUST return one IMAGE inlineData part — no text-only response; single clearest concept render.)${geometryRetryHint}${horizontalLayoutOverride}${extraGoalSuffix}`;

          const renderPrep = buildGeminiConceptImagePromptText({
            promptContext: basePrompt,
            userGoal: userGoalAug,
            // Skip the visual-spec directive when the user explicitly described a
            // horizontal layout — the spec pipeline defaults to vertical tiers and
            // its "vertical spacing" language overrides the user's request.
            extractedVisualDirective: wantsHorizontalRowDirect
              ? undefined
              : extractedVisualDirective,
            visualMode: conceptImageVisualMode,
            geometryRefinement: refinementGeometryIntent.hasGeometryChange,
          });

          const visual = await geminiGenerateConceptImage({
            promptContext: basePrompt,
            userGoal: userGoalAug,
            referenceImageParts: referencePartsOverride ?? conceptReferenceForRender,
            extractedVisualDirective: wantsHorizontalRowDirect
              ? undefined
              : extractedVisualDirective,
            visualMode: conceptImageVisualMode,
            geometryRefinement: refinementGeometryIntent.hasGeometryChange,
          });

          conceptRenderAudit = {
            provider: "gemini",
            imageModel: renderPrep.imageModel,
            homeownerPrompt: lastUserText.slice(0, 16_000) || "(photo)",
            renderPromptText: renderPrep.fullPromptText,
            ...(extractedVisualDirective?.trim()
              ? {
                  extractedVisualDirective: extractedVisualDirective
                    .trim()
                    .slice(0, 12_000),
                }
              : {}),
            referenceImageCount: conceptReferenceForRender?.length ?? 0,
            renderedAt: new Date().toISOString(),
          };

          if (!("error" in visual) && visual.images.length > 0) {
            for (const img of visual.images) {
              out.push({ mimeType: img.mimeType, dataBase64: img.dataBase64 });
            }
            break;
          }
          if (!("error" in visual) && visual.images.length === 0) {
            prevOkNoImages = true;
            if (attempt === 3) {
              failure = "Gemini returned no image parts";
            }
          }
          if ("error" in visual) {
            console.warn(
              "[project-assistant] geminiGenerateConceptImage error:",
              visual.error,
            );
            failure = visual.error;
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
        return { images: out, failureDetail: failure };
      };

      const wallOrdinal = (i: number) =>
        ["first", "second", "third", "fourth", "fifth", "sixth"][i] ?? `${i + 1}th`;

      let imageGenerationFailureDetail: string | null = null;

      if (isMultiWallRender) {
        /**
         * Multi-wall: one concept render per labeled wall, each anchored to
         * that wall's photo only. The shared extractedVisualDirective (finish,
         * style, counts) applies to every wall — the style lock that keeps the
         * room cohesive.
         */
        console.info(
          `[project-assistant] multi-wall render: ${multiWallCount} walls (${wallLabelsEffective.slice(0, multiWallCount).join(" | ")})`,
        );
        for (let w = 0; w < multiWallCount; w++) {
          const label = wallLabelsEffective[w];
          const wallSuffix =
            `\n\nWALL ${w + 1} OF ${multiWallCount} — ${label.toUpperCase()}: ` +
            `This concept render is ONLY for the ${label}. Use ONLY the attached room photo for this wall ` +
            `(the ${wallOrdinal(w)} uploaded photo) as the spatial reference — ignore any other room layout. ` +
            `Match the shared design brief exactly (same finishes, materials, hardware, colors, and style as the other walls) ` +
            `so the whole room reads as one cohesive design. ` +
            `Photorealistic render only — no text labels or annotations in the image.`;
          const wallRefParts = schematicReferencePart
            ? [schematicReferencePart, multiWallPhotoSource[w]]
            : [multiWallPhotoSource[w]];
          const wallResult = await runOneRender(wallSuffix, wallRefParts);
          if (wallResult.images.length === 0 && wallResult.failureDetail) {
            imageGenerationFailureDetail = wallResult.failureDetail;
          }
          for (const img of wallResult.images) {
            responseImages.push({
              mimeType: img.mimeType,
              data: img.dataBase64,
              caption: label,
            });
          }
        }
        // Floor plan: top-down view tying the walls together (how the L/U
        // wraps). Generated in code — deterministic, not a model render.
        try {
          const floorPlan = await buildPlannerFloorPlan({
            wallLabels: wallLabelsEffective.slice(0, multiWallCount),
            spec: conceptRenderSpec ?? emptyPlannerVisualSpec(),
            roomType: conceptRenderSpec?.designCategory ?? null,
          });
          if (floorPlan) {
            responseImages.push({
              mimeType: floorPlan.mimeType,
              data: floorPlan.dataBase64,
              caption: "Floor plan",
            });
          }
        } catch (e) {
          console.warn("[project-assistant] floor plan generation failed:", e);
        }
      } else {
        const firstPass = await runOneRender("");
        let renderedImages = firstPass.images;
        imageGenerationFailureDetail = firstPass.failureDetail;

      /**
       * Accuracy check: the model hallucinates shelf counts, so verify with
       * vision and regenerate once with an explicit correction when wrong.
       * A null/failed count never blocks delivery. Skipped in multi-wall mode
       * (per-wall counts are enforced by the shared schematic instead).
       */
      const expectedShelfCount = conceptRenderSpec?.shelfCount ?? null;
      if (renderedImages.length > 0 && expectedShelfCount !== null) {
        const first = renderedImages[0];
        const observed = await geminiCountShelvesInImage({
          imageMimeType: first.mimeType,
          imageDataBase64: first.dataBase64,
        });
        if (observed !== null && observed !== expectedShelfCount) {
          console.warn(
            `[project-assistant] shelf-count mismatch (expected ${expectedShelfCount}, saw ${observed}) — regenerating once with correction.`,
          );
          renderedImages = (
            await runOneRender(
              `\n\n(Accuracy correction: the previous render showed ${observed} shelf boards but the homeowner asked for exactly ${expectedShelfCount}. This render MUST show exactly ${expectedShelfCount} shelf boards — count them in the schematic reference and match it.)`,
            )
          ).images;
        }
      }

      for (const img of renderedImages) {
        responseImages.push({ mimeType: img.mimeType, data: img.dataBase64 });
      }
      } // end single-render path

      if (responseImages.length === 0) {
        cleanReply = stripMisleadingImageDeliveryClaims(cleanReply);
        if (hasAnyPriorRender) {
          cleanReply = appendSketchNotUpdatedNotice(cleanReply, {
            geometryRefinement: refinementGeometryIntent.hasGeometryChange,
          });
        } else {
          cleanReply = appendVisualizationUnavailableNotice(cleanReply, {
            technicalDetail: imageGenerationFailureDetail,
            skipIfConflictBlockPresent: false,
          });
        }
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
        const conceptImages = await conceptImagesForAdminCrm(responseImages);
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
              `category:${intakeDiagnostics.category}`,
              `style:${intakeDiagnostics.style}`,
              `budget:${intakeDiagnostics.budget}`,
              `dimensions:${intakeDiagnostics.dimensions}`,
              intakeDiagnostics.augmentedFromAssistant.length
                ? `augmented:${intakeDiagnostics.augmentedFromAssistant.join("+")}`
                : null,
              `photos:${hasPhotoContextInSession}`,
              `portalPhotos:${portalSpacePhotoParts.length}`,
              `sketchRefs:${sketchReferenceFiles.length}`,
              `uploadThisTurn:${userAttachedPhotosThisTurn}`,
            ]
              .filter(Boolean)
              .join(";"),
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

      // Sales handoff (background CRM): move the profile through the pipeline
      // and persist the agreed callback. Never user-visible.
      try {
        const userId = portalSession.userId;
        if (advanceTowardSiteVisit && handoffCurrentPhase === "Planning") {
          await setPortalUserProjectPhase({
            portalUserId: userId,
            phase: SALES_PIPELINE_PHASES.designApproved,
            details: `Customer approved a concept direction in the AI planner on ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}. Callback scheduling in progress.`,
          });
          await appendPortalCommunication({
            portalUserId: userId,
            channel: "app_notice",
            summary: "AI planner: customer approved a concept design",
            detail: "Sales handoff started — booking a consultation call with Tom.",
            recordedBy: "AI planner",
          });
        }
        if (pendingScheduledCall) {
          const topic = intakeDiagnostics.category
            ? `${intakeDiagnostics.category} project consultation`
            : "Project consultation";
          await recordScheduledCall({
            portalUserId: userId,
            scheduledFor: pendingScheduledCall.scheduledFor,
            label: pendingScheduledCall.label,
            phone: pendingScheduledCall.phone,
            topic,
          });
          await setPortalUserProjectPhase({
            portalUserId: userId,
            phase: SALES_PIPELINE_PHASES.callScheduled,
            details: `Consultation call scheduled for ${pendingScheduledCall.label} (${pendingScheduledCall.phone}).`,
          });
          await appendPortalCommunication({
            portalUserId: userId,
            channel: "app_notice",
            summary: `AI planner: consultation call scheduled — ${pendingScheduledCall.label}`,
            detail: `Tom to call ${pendingScheduledCall.phone}. Topic: ${topic}.`,
            recordedBy: "AI planner",
          });
        }
      } catch (handoffErr) {
        console.warn(
          "[project-assistant] sales handoff background write failed:",
          handoffErr instanceof Error ? handoffErr.message : handoffErr,
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
      ...(hasAnyPriorRender &&
      responseImages.length === 0 &&
      allowConceptImage
        ? { sketchNotUpdated: true }
        : {}),
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
        intakeDiagnostics,
        hasPhotoContextInSession,
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
