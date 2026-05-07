import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { appendAiPlannerActivity } from "@/lib/client-portal-store";

type OpenAIResponse = {
  output_text?: string;
};

const assistantInstructions = `You are the planning assistant for Level Up Install, a finish carpentry business.
Your job is to help homeowners plan their project and prepare for booking.

When responding:
- Be warm, concise, and practical.
- Use the intake details if provided: room type, dimensions, style, budget, timeline.
- Give concrete ideas based on the user's goals and any photo context.
- Ask up to 3 clarifying questions only when truly needed.
- Include rough scope guidance, likely materials to discuss, and next planning steps.
- Mention that final measurements and quote are confirmed on-site.
- Keep tone premium and professional.
- Format output as:
  ## Project Brief
  - Room/Area:
  - Goals:
  - Style Direction:
  - Budget & Timeline:
  - Suggested Build Ideas:
  - Materials to Consider:
  - Questions to Confirm:
  - Next Step with Level Up Install:
`;

type IntakeDetails = {
  roomType: string;
  dimensions: string;
  style: string;
  budget: string;
  timeline: string;
};

function buildIntakeSummary(intake: IntakeDetails): string {
  return `Room/Area: ${intake.roomType || "Not provided"}
Dimensions: ${intake.dimensions || "Not provided"}
Style: ${intake.style || "Not provided"}
Budget: ${intake.budget || "Not provided"}
Timeline: ${intake.timeline || "Not provided"}`;
}

function buildFallbackReply(
  prompt: string,
  imageCount: number,
  intake: IntakeDetails,
): string {
  const photoNote =
    imageCount > 0
      ? `I received ${imageCount} photo${imageCount > 1 ? "s" : ""}, which helps with layout-based suggestions.`
      : "If you upload photos of your space, I can give more layout-specific suggestions.";

  return `${photoNote}

## Project Brief
- Room/Area: ${intake.roomType || "To confirm on consult"}
- Goals: ${prompt}
- Style Direction: ${intake.style || "To be selected"}
- Budget & Timeline: ${intake.budget || "Not provided"} / ${intake.timeline || "Not provided"}
- Suggested Build Ideas:
  1) Custom storage or built-ins sized to your room.
  2) Finish trim/detail upgrades for a cleaner premium look.
  3) Feature carpentry element (bench, shelving, or media wall).
- Materials to Consider:
  - Paint-grade MDF or plywood core with hardwood trim.
  - Soft-close hardware and durable finish coatings.
  - Matching trim profiles for visual consistency.
- Questions to Confirm:
  - Exact wall and ceiling dimensions?
  - Any outlets, vents, doors, or baseboard constraints?
  - Preferred finish color and timeline target?
- Next Step with Level Up Install:
  Share final measurements/photos and we will confirm scope during the on-site visit before final quote.
`;
}

async function callOpenAI(
  prompt: string,
  images: File[],
  intake: IntakeDetails,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const imageInputs = await Promise.all(
    images.map(async (image) => {
      const bytes = Buffer.from(await image.arrayBuffer());
      return {
        type: "input_image",
        image_url: `data:${image.type};base64,${bytes.toString("base64")}`,
      };
    }),
  );

  const payload = {
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: assistantInstructions }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Client prompt:
${prompt}

Intake details:
${buildIntakeSummary(intake)}`,
          },
          ...imageInputs,
        ],
      },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Assistant service is temporarily unavailable.");
  }

  const data = (await response.json()) as OpenAIResponse;
  return data.output_text ?? "";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const intake: IntakeDetails = {
      roomType: String(formData.get("roomType") ?? "").trim(),
      dimensions: String(formData.get("dimensions") ?? "").trim(),
      style: String(formData.get("style") ?? "").trim(),
      budget: String(formData.get("budget") ?? "").trim(),
      timeline: String(formData.get("timeline") ?? "").trim(),
    };

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const files = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File);

    const imageFiles = files.filter(
      (file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024,
    );

    const aiReply = await callOpenAI(prompt, imageFiles, intake);
    const reply =
      aiReply && aiReply.trim()
        ? aiReply.trim()
        : buildFallbackReply(prompt, imageFiles.length, intake);

    const portalSession = await getSessionFromCookie();
    if (portalSession?.userId) {
      try {
        await appendAiPlannerActivity(portalSession.userId, {
          promptPreview: prompt.slice(0, 280),
          replyPreview: reply.slice(0, 480),
          intakeSummary: buildIntakeSummary(intake),
          imageCount: imageFiles.length,
        });
      } catch {
        /* Activity logging must not break planner responses */
      }
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "Could not generate project guidance right now." },
      { status: 500 },
    );
  }
}
