import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  geminiGenerateConceptImage,
  geminiPlannerMultiTurn,
  homeownerPureEnthusiasmAfterSketch,
  homeownerSignalsHappyOrReady,
  isGeminiConfigured,
} from "@/lib/gemini-client";
import {
  extractPlannerPhase,
  type PlannerPhaseTag,
} from "@/lib/planner-phase-utils";
import { MORGAN_PLANNER_SYSTEM } from "@/lib/morgan-planner-prompt";
import { appendAiPlannerActivity } from "@/lib/client-portal-store";

/** After this many assistant turns that included a concept sketch, steer toward in-person consult. */
const SKETCH_ROUNDS_BEFORE_IN_PERSON_NUDGE = 5;

function buildMorganSystemInstruction(params: {
  priorTurnHadConceptImage: boolean;
  sketchLikelyAfterReply: boolean;
  userAttachedPhotosThisTurn: boolean;
  sketchRoundsDelivered: number;
  suggestInPersonAfterManySketches: boolean;
  advanceTowardSiteVisit: boolean;
}): string {
  const chunks: string[] = [MORGAN_PLANNER_SYSTEM];

  if (params.priorTurnHadConceptImage) {
    chunks.push(`
## Session hint (platform)
Your immediately previous assistant turn included a **concept visualization** the homeowner saw. Their latest message may react to that image—prioritize what they **like** vs want **changed**. A **revised sketch will usually be generated** after your reply when they give feedback, so keep your text concise and end by checking if the direction feels closer (still no materials lists).`);
  }

  if (params.sketchLikelyAfterReply) {
    chunks.push(`
## Session hint (platform)
The platform will likely attach a **new concept sketch** after this reply (either because they just shared space photos, or they are refining an earlier sketch). Thank them briefly when photos are new; otherwise acknowledge you're adjusting visually. Ask whether this direction matches what they had in mind and what they'd still tweak.`);
  }

  if (params.userAttachedPhotosThisTurn) {
    chunks.push(`
## Session hint (platform)
The homeowner attached **real photos of their space** with this message—thank them warmly. Stay short; the system will generate a first-pass sketch from the consultation + their pictures. Prefer moving to \`[PHASE:refine]\` after this turn so you can iterate on the visualization together.`);
  }

  if (params.suggestInPersonAfterManySketches) {
    const n = params.sketchRoundsDelivered;
    chunks.push(`
## Session hint (platform)
The homeowner has already received **${n} rounds** with AI concept sketches in this chat. If they still sound unhappy or keep asking for big visual swings, **set expectations kindly**: this planner is a **tool to help** with ideas—not a substitute for walking the actual space. Recommend **booking an in-person consultation** with one of Level Up's carpenters **for the best results** (tie naturally to **Secure your booking** / the call-out when appropriate). Stay brief; it's okay to offer smaller tweaks, but be honest about what remote renders can't capture.`);
  }

  if (params.advanceTowardSiteVisit) {
    chunks.push(`
## Session hint (platform)
The homeowner sounds **happy with the direction** or **ready to move forward**. Guide them to the **next stage of your sales flow**: use **Secure your booking** below this chat to arrange a **site visit / call-out** so a carpenter can **verify measurements**, confirm conditions in person, and help turn today's ideas into a **clearer, job-ready plan** toward completing the work (still accurate: firm quotes follow after that visit—not here). Sound genuinely pleased for them; keep it one warm invitation, not a hard sell.`);
  }

  return chunks.join("\n");
}

type PlainChatRole = "user" | "assistant";

export type PlannerClientMessage = {
  role: PlainChatRole;
  content: string;
};

type ContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const MAX_MESSAGES = 28;

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

function buildFallbackReply(imageCount: number): string {
  const photoNote =
    imageCount > 0
      ? "Thanks for the photo — that's helpful.\n\n"
      : "";
  return `${photoNote}I'm having a quick connection hiccup on my side. Let's keep going — what's a rough budget range you're aiming for on this project?

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
      (file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024,
    );

    const lastUserText =
      [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";

    if (!lastUserText && imageFiles.length === 0) {
      return NextResponse.json(
        { error: "Add a message or attach at least one photo." },
        { status: 400 },
      );
    }

    const userAttachedPhotosThisTurn = imageFiles.length > 0;

    const pureEnthusiasmAfterSketch =
      priorTurnHadConceptImage &&
      !userAttachedPhotosThisTurn &&
      homeownerPureEnthusiasmAfterSketch(lastUserText);

    const advanceTowardSiteVisit =
      homeownerSignalsHappyOrReady(lastUserText) &&
      (clientPhase === "recommend" ||
        clientPhase === "refine" ||
        priorTurnHadConceptImage);

    const sketchLikelyAfterReply =
      !pureEnthusiasmAfterSketch &&
      (userAttachedPhotosThisTurn ||
        (priorTurnHadConceptImage &&
          clientPhase !== "consultation" &&
          Boolean(lastUserText.trim())));

    const latestImageParts = await loadLatestImageParts(imageFiles);

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
          systemInstruction: buildMorganSystemInstruction({
            priorTurnHadConceptImage,
            sketchLikelyAfterReply,
            userAttachedPhotosThisTurn,
            sketchRoundsDelivered,
            suggestInPersonAfterManySketches,
            advanceTowardSiteVisit,
          }),
          contents,
        });

        if (!("error" in result)) {
          replyRaw = result.text.trim();
          plannerInlineImages = result.images.map((img) => ({
            mimeType: img.mimeType,
            data: img.dataBase64,
          }));
        }
      }
    } catch {
      replyRaw = "";
    }

    if (!replyRaw) {
      replyRaw = buildFallbackReply(imageFiles.length);
    }

    const { cleanReply, phase, showPhotoUploader } = extractPlannerPhase(replyRaw);

    const allowConceptImage =
      isGeminiConfigured() &&
      plannerInlineImages.length === 0 &&
      !pureEnthusiasmAfterSketch &&
      (userAttachedPhotosThisTurn ||
        (priorTurnHadConceptImage &&
          Boolean(lastUserText.trim()) &&
          phase !== "consultation"));

    const responseImages: { mimeType: string; data: string }[] = [...plannerInlineImages];

    if (allowConceptImage && responseImages.length === 0) {
      const transcript = messages
        .slice(-12)
        .map((m) => `${m.role === "user" ? "Homeowner" : "Morgan"}: ${m.content}`)
        .join("\n");

      const exploratoryNote =
        phase === "consultation" && !userAttachedPhotosThisTurn
          ? "\n\n(Context: early consultation — visualization is exploratory only.)"
          : phase === "consultation" && userAttachedPhotosThisTurn
            ? "\n\n(Context: homeowner shared real room photos during consultation — anchor the sketch to their space and stated goals; still not a final quote.)"
            : "\n\n(Context: refining direction from prior chat + any photos — adjust the sketch to match their feedback.)";

      const visual = await geminiGenerateConceptImage({
        promptContext: `${transcript}\n\nMorgan reply:\n${cleanReply.slice(0, 6000)}${exploratoryNote}`,
        userGoal: lastUserText.slice(0, 4000) || cleanReply.slice(0, 1200),
        referenceImageParts: userAttachedPhotosThisTurn ? latestImageParts : undefined,
      });

      if (!("error" in visual) && visual.images.length > 0) {
        for (const img of visual.images) {
          responseImages.push({ mimeType: img.mimeType, data: img.dataBase64 });
        }
      }
    }

    const portalSession = await getSessionFromCookie();
    if (portalSession?.userId) {
      try {
        await appendAiPlannerActivity(portalSession.userId, {
          promptPreview: lastUserText.slice(0, 280) || "(photo)",
          replyPreview: cleanReply.slice(0, 480),
          intakeSummary: `phase:${phase};turns:${messages.length}`,
          imageCount: imageFiles.length + responseImages.length,
        });
      } catch {
        /* Activity logging must not break planner responses */
      }
    }

    return NextResponse.json({
      reply: cleanReply,
      phase,
      showPhotoUploader,
      ...(responseImages.length ? { images: responseImages } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not generate project guidance right now." },
      { status: 500 },
    );
  }
}
