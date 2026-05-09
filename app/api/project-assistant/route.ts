import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  geminiGenerateConceptImage,
  geminiPlannerTurn,
  isGeminiConfigured,
  userRequestedImageGeneration,
} from "@/lib/gemini-client";
import { LEVEL_UP_LEAD_COORDINATOR_PROMPT } from "@/lib/level-up-gemini-persona";
import { appendAiPlannerActivity } from "@/lib/client-portal-store";

const PLANNER_SYSTEM = `${LEVEL_UP_LEAD_COORDINATOR_PROMPT}

You are also the AI project planner for homeowners preparing to book Level Up Install.

When responding:
- Be warm, concise, and practical.
- Use intake details when provided: room type, dimensions, style, budget, timeline.
- Give concrete ideas grounded in retailer-available materials (IKEA, Home Depot, Lowe's).
- Ask up to 3 clarifying questions only when truly needed.
- Include rough scope guidance, likely materials to discuss, and next planning steps.
- Mention that final measurements and quote are confirmed on-site.
- Whenever you suggest visual ideas, include a short **Materials List** (bullet list) of items findable at a typical hardware store.
- Format output as:
## Project Brief
- Room/Area:
- Goals:
- Style Direction:
- Budget & Timeline:
- Suggested Build Ideas:
- Materials List:
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
- Materials List:
  - Paint-grade MDF or plywood core with hardwood trim (Home Depot / Lowe's).
  - Soft-close hinges/slides and durable cabinet paint (IKEA / big-box hardware aisle).
  - Trim profiles matched to existing door casing where possible.
- Questions to Confirm:
  - Exact wall and ceiling dimensions?
  - Any outlets, vents, doors, or baseboard constraints?
  - Preferred finish color and timeline target?
- Next Step with Level Up Install:
  Share final measurements/photos and we will confirm scope during the on-site visit before final quote.
`;
}

async function callGeminiPlanner(
  prompt: string,
  images: File[],
  intake: IntakeDetails,
): Promise<{ text: string; plannerImages: { mimeType: string; data: string }[] } | null> {
  if (!isGeminiConfigured()) return null;

  const imageParts: Array<{ inline_data: { mime_type: string; data: string } }> =
    await Promise.all(
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

  const userText = `Client prompt:
${prompt}

Intake details:
${buildIntakeSummary(intake)}`;

  const result = await geminiPlannerTurn({
    systemInstruction: PLANNER_SYSTEM,
    userText,
    imageParts,
  });

  if ("error" in result) {
    throw new Error("Assistant service is temporarily unavailable.");
  }

  const plannerImages = result.images.map((img) => ({
    mimeType: img.mimeType,
    data: img.dataBase64,
  }));

  return { text: result.text, plannerImages };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const includeConceptImage =
      String(formData.get("includeConceptImage") ?? "").toLowerCase() === "true" ||
      String(formData.get("includeConceptImage") ?? "") === "1";

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

    let reply = "";
    const responseImages: { mimeType: string; data: string }[] = [];

    try {
      const gemini = await callGeminiPlanner(prompt, imageFiles, intake);
      if (gemini?.text?.trim()) {
        reply = gemini.text.trim();
      }
      if (gemini?.plannerImages?.length) {
        responseImages.push(...gemini.plannerImages);
      }
    } catch {
      reply = "";
    }

    if (!reply.trim()) {
      reply = buildFallbackReply(prompt, imageFiles.length, intake);
    }

    const wantVisual =
      includeConceptImage || userRequestedImageGeneration(prompt);

    if (wantVisual && isGeminiConfigured() && responseImages.length === 0) {
      const visual = await geminiGenerateConceptImage({
        promptContext: `${buildIntakeSummary(intake)}\n\nPlanner draft:\n${reply.slice(0, 8000)}`,
        userGoal: prompt.slice(0, 4000),
      });

      if (!("error" in visual) && visual.images.length > 0) {
        for (const img of visual.images) {
          responseImages.push({ mimeType: img.mimeType, data: img.dataBase64 });
        }
        if (visual.text?.trim()) {
          reply = `${reply}\n\n---\n**Concept visualization notes:**\n${visual.text.trim()}`;
        }
      }
    }

    const portalSession = await getSessionFromCookie();
    if (portalSession?.userId) {
      try {
        await appendAiPlannerActivity(portalSession.userId, {
          promptPreview: prompt.slice(0, 280),
          replyPreview: reply.slice(0, 480),
          intakeSummary: buildIntakeSummary(intake),
          imageCount: imageFiles.length + responseImages.length,
        });
      } catch {
        /* Activity logging must not break planner responses */
      }
    }

    return NextResponse.json({
      reply,
      ...(responseImages.length ? { images: responseImages } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not generate project guidance right now." },
      { status: 500 },
    );
  }
}
