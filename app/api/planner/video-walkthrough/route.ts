import { NextResponse } from "next/server";
import {
  geminiExtractVideoWalkthroughBrief,
  geminiExtractVideoWalkthroughBriefFromFile,
  geminiUploadFile,
} from "@/lib/gemini-client";

/**
 * POST /api/planner/video-walkthrough
 * Accepts a narrated video walkthrough (video + audio).
 * Gemini watches the video and listens to the narration,
 * returning a structured design brief.
 *
 * Body: { videoMimeType: string, videoDataBase64: string }
 * - Under 20MB: sent inline (fast)
 * - 20MB–200MB: uploaded via Gemini Files API (supports ~10 min walkthroughs)
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

    // Size routing:
    // - Under 20MB binary (~27MB base64): inline (fast, single request)
    // - 20MB–200MB: Gemini Files API (supports up to ~10 min walkthroughs)
    const approxBytes = Math.floor(videoDataBase64.length * 0.75);
    let brief: string | null = null;

    if (approxBytes <= 20 * 1024 * 1024) {
      brief = await geminiExtractVideoWalkthroughBrief({
        videoMimeType,
        videoDataBase64,
      });
    } else if (approxBytes <= 200 * 1024 * 1024) {
      const fileUri = await geminiUploadFile({
        mimeType: videoMimeType,
        dataBase64: videoDataBase64,
        displayName: "video-walkthrough",
      });
      if (!fileUri) {
        return NextResponse.json(
          { error: "Video upload failed. Please try a shorter video." },
          { status: 502 },
        );
      }
      brief = await geminiExtractVideoWalkthroughBriefFromFile({
        fileUri,
        videoMimeType,
      });
    } else {
      return NextResponse.json(
        { error: "Video too large. Please keep walkthroughs under ~10 minutes." },
        { status: 413 },
      );
    }

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
