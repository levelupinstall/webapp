import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  geminiGenerateConceptImage,
  geminiPlannerMultiTurn,
  isGeminiConfigured,
  userRequestedImageGeneration,
} from "@/lib/gemini-client";
import { extractPlannerPhase } from "@/lib/planner-phase-utils";
import { MORGAN_PLANNER_SYSTEM } from "@/lib/morgan-planner-prompt";
import { appendAiPlannerActivity } from "@/lib/client-portal-store";

function buildMorganSystemInstruction(params: {
  priorTurnHadConceptImage: boolean;
  willAttachConceptImageThisTurn: boolean;
}): string {
  const chunks: string[] = [MORGAN_PLANNER_SYSTEM];

  if (params.priorTurnHadConceptImage) {
    chunks.push(`
## Session hint (platform)
Your immediately previous assistant turn included a **concept visualization** the homeowner saw. Their latest message may react to that image—prioritize understanding what they **like** vs want **changed**. Adjust your guidance across turns until they sound satisfied or ask for another sketch; keep questions focused and short. Once you're giving directional ideas (not still purely filling intake), prefer staying in refine-phase behavior and tagging accordingly.`);
  }

  if (params.willAttachConceptImageThisTurn) {
    chunks.push(`
## Session hint (platform)
This reply will likely be shown **together with a new concept sketch**. Acknowledge that it's a draft for discussion. Close by inviting quick reactions—what appeals and what they'd tweak—so the **next** message can narrow or pivot (still short; no materials lists).`);
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

    const includeConceptImage =
      String(formData.get("includeConceptImage") ?? "").toLowerCase() === "true" ||
      String(formData.get("includeConceptImage") ?? "") === "1";

    const priorTurnHadConceptImage =
      String(formData.get("priorTurnHadConceptImage") ?? "").toLowerCase() === "true" ||
      String(formData.get("priorTurnHadConceptImage") ?? "") === "1";

    const files = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File);

    const imageFiles = files.filter(
      (file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024,
    );

    const lastUserText =
      [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";

    const willAttachConceptImageThisTurn =
      includeConceptImage || userRequestedImageGeneration(lastUserText);

    if (!lastUserText && imageFiles.length === 0) {
      return NextResponse.json(
        { error: "Add a message or attach at least one photo." },
        { status: 400 },
      );
    }

    const contents = buildGeminiContents(messages, await loadLatestImageParts(imageFiles));
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
            willAttachConceptImageThisTurn,
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

    const { cleanReply, phase } = extractPlannerPhase(replyRaw);

    const allowConceptImage = willAttachConceptImageThisTurn;

    const responseImages: { mimeType: string; data: string }[] = [...plannerInlineImages];

    if (allowConceptImage && isGeminiConfigured() && responseImages.length === 0) {
      const transcript = messages
        .slice(-12)
        .map((m) => `${m.role === "user" ? "Homeowner" : "Morgan"}: ${m.content}`)
        .join("\n");

      const exploratoryNote =
        phase === "consultation"
          ? "\n\n(Context: early consultation — any visualization is exploratory/inspirational only, not a committed design or quote.)"
          : "";

      const visual = await geminiGenerateConceptImage({
        promptContext: `${transcript}\n\nMorgan reply:\n${cleanReply.slice(0, 6000)}${exploratoryNote}`,
        userGoal: lastUserText.slice(0, 4000) || cleanReply.slice(0, 1200),
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
      ...(responseImages.length ? { images: responseImages } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not generate project guidance right now." },
      { status: 500 },
    );
  }
}
