import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { getUserPortalData } from "@/lib/client-portal-store";

type PortalChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenAIResponse = {
  output_text?: string;
};

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
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const user = await getUserPortalData(session.userId);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        reply:
          "I can help you with project planning, scope, timelines, and next steps. To enable full ChatGPT responses, please configure OPENAI_API_KEY in server environment settings.",
      });
    }

    const systemPrompt = `You are a live client support agent for Level Up Install, a finish carpentry business.
Be concise, professional, and practical.
Use client context when helpful:
- Username: ${user.username}
- Current project phase: ${user.projectStatus.phase}
- Current project notes: ${user.projectStatus.details}
- Saved idea count: ${user.ideas.length}

Help with planning, clarifying scope, preparing for booking, and understanding invoices/status.
Do not provide legal/financial guarantees.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          ...history.map((item) => ({
            role: item.role,
            content: [{ type: "input_text", text: item.content }],
          })),
          {
            role: "user",
            content: [{ type: "input_text", text: message }],
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Chat agent is temporarily unavailable." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as OpenAIResponse;
    const reply = data.output_text?.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "No response received from chat agent." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "Unable to process chat request right now." },
      { status: 500 },
    );
  }
}

