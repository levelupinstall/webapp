import { NextResponse } from "next/server";
import { geminiExtractVideoWalkthroughBrief } from "@/lib/gemini-client";

/**
 * POST /api/planner/video-walkthrough
 * Accepts a narrated video walkthrough (video + audio).
 * Gemini watches the video and listens to the narration,
 * returning a structured design brief.
 *
 * Body: { videoMimeType: string, videoDataBase64: string }
 * Video should be under ~20MB (inline). For longer walkthroughs,
 * the client should compress or trim first.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { videoMimeType, videoDataBase64 } = body as {
      videoMimeType?: string;
      videoDataBase64?: string;
    };

    if (!videoMimeType || !videoDataBase64) {
      return NextResponse.json(
        { error: "Missing videoMimeType or videoDataBase64" },
        { status: 400 },
      );
    }

    // Rough size guard: base64 is ~4/3 of binary. 20MB binary ≈ 27MB base64.
    if (videoDataBase64.length > 28_000_000) {
      return NextResponse.json(
        { error: "Video too large. Please keep walkthroughs under ~2 minutes or compress the video." },
        { status: 413 },
      );
    }

    const brief = await geminiExtractVideoWalkthroughBrief({
      videoMimeType,
      videoDataBase64,
    });

    if (!brief) {
      return NextResponse.json(
        { error: "Could not extract a design brief from the video. Please try again or describe your project in text." },
        { status: 502 },
      );
    }

    return NextResponse.json({ brief });
  } catch (e) {
    console.error("[video-walkthrough] failed:", e);
    return NextResponse.json(
      { error: "Video processing failed. Please try again." },
      { status: 500 },
    );
  }
}
