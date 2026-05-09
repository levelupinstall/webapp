import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  geminiGenerateConceptImage,
  geminiTextChat,
  isGeminiConfigured,
  userRequestedImageGeneration,
} from "@/lib/gemini-client";
import { LEVEL_UP_LEAD_COORDINATOR_PROMPT } from "@/lib/level-up-gemini-persona";
import { getUserPortalData } from "@/lib/client-portal-store";

type PortalChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Gemini turns must start with `user`; drop leading assistant bubbles (e.g. UI greeting). */
function normalizeHistory(history: PortalChatMessage[]): PortalChatMessage[] {
  let start = 0;
  while (start < history.length && history[start].role === "assistant") start += 1;
  return history.slice(start);
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      message?: string;
      history?: PortalChatMessage[];
    };
    const message = body.message?.trim() || "";
    const history = normalizeHistory(
      Array.isArray(body.history) ? body.history.slice(-8) : [],
    );

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const user = await getUserPortalData(session.userId);

    if (!isGeminiConfigured()) {
      return NextResponse.json({
        reply:
          "I can help with scheduling, scope, and finish carpentry planning. To enable the Gemini assistant, add GEMINI_API_KEY to your server environment (Google AI Studio).",
      });
    }

    const portalContext = `Client portal context:
- Username: ${user.username}
- Current project phase: ${user.projectStatus.phase}
- Current project notes: ${user.projectStatus.details}
- Saved idea count: ${user.ideas.length}`;

    const systemInstruction = `${LEVEL_UP_LEAD_COORDINATOR_PROMPT}

${portalContext}

You may answer scheduling questions, sales inquiries, and technical carpentry topics within Level Up Install's scope. Keep replies concise unless the user asks for detail.`;

    const textResult = await geminiTextChat({
      systemInstruction,
      history,
      message,
    });

    if ("error" in textResult) {
      return NextResponse.json(
        { error: "Chat agent is temporarily unavailable." },
        { status: 502 },
      );
    }

    let reply = textResult.text;
    const images: { mimeType: string; data: string }[] = [];

    if (textResult.images.length > 0) {
      for (const img of textResult.images) {
        images.push({ mimeType: img.mimeType, data: img.dataBase64 });
      }
    }

    if (userRequestedImageGeneration(message) && images.length === 0) {
      const visual = await geminiGenerateConceptImage({
        promptContext: `${portalContext}\n\nRecent chat focus:\n${message}`,
        userGoal: message,
      });

      if (!("error" in visual) && visual.images.length > 0) {
        for (const img of visual.images) {
          images.push({ mimeType: img.mimeType, data: img.dataBase64 });
        }
        if (visual.text && !reply.includes(visual.text)) {
          reply = `${reply}\n\n${visual.text}`.trim();
        }
      }
    }

    if (!reply && images.length === 0) {
      return NextResponse.json(
        { error: "No response received from chat agent." },
        { status: 502 },
      );
    }

    if (!reply && images.length > 0) {
      reply =
        "Here is a grounded concept visualization based on your request (retailer-realistic materials only).";
    }

    return NextResponse.json({ reply, ...(images.length ? { images } : {}) });
  } catch {
    return NextResponse.json(
      { error: "Unable to process chat request right now." },
      { status: 500 },
    );
  }
}
