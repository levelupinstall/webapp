import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { addIdeaForUser, getUserPortalData } from "@/lib/client-portal-store";

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserPortalData(session.userId);
  return NextResponse.json({ ideas: user.ideas });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    notes?: string;
    conversation?: {
      messages?: Array<{
        role?: "user" | "assistant";
        content?: string;
        images?: Array<{ mimeType?: string; dataUrl?: string }>;
      }>;
    };
  };
  const title = body.title?.trim() || "";
  const notes = body.notes?.trim() || "";

  if (!title || !notes) {
    return NextResponse.json(
      { error: "Idea title and notes are required." },
      { status: 400 },
    );
  }

  const parsedMessages: Array<{
    role: "user" | "assistant";
    content: string;
    images?: Array<{ mimeType: string; dataUrl: string }>;
  }> = Array.isArray(body.conversation?.messages)
    ? body.conversation.messages
        .map((m) => {
          const role: "user" | "assistant" =
            m?.role === "assistant" ? "assistant" : "user";
          const content = String(m?.content ?? "");
          const images = Array.isArray(m?.images)
            ? m.images
                .map((img) => ({
                  mimeType: String(img?.mimeType ?? "image/png"),
                  dataUrl: String(img?.dataUrl ?? ""),
                }))
                .filter((img) => img.dataUrl.startsWith("data:"))
            : [];
          return {
            role,
            content,
            ...(images.length ? { images } : {}),
          };
        })
        .filter((m) => m.content.trim().length > 0 || (m.images?.length ?? 0) > 0)
    : [];

  const idea = await addIdeaForUser(session.userId, {
    title,
    notes,
    ...(parsedMessages.length ? { conversation: { messages: parsedMessages } } : {}),
  });
  return NextResponse.json({ idea });
}

