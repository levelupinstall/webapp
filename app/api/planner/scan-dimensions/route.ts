import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { geminiExtractScanDimensions } from "@/lib/gemini-client";
import { buildScanDimensionPrompt, normalizeScanDimensions } from "@/lib/room-scan";

/**
 * Extract real room dimensions from a 3D-scan floor plan export.
 * The customer uploads their Polycam floor plan; vision reads the wall
 * lengths so the planner stops guessing with assumed `*` dimensions.
 */
export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Sign in to upload a room scan." }, { status: 401 });
  }

  let body: { imageDataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const dataUrl = body.imageDataUrl?.trim();
  if (!dataUrl) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) {
    return NextResponse.json({ error: "Invalid image format." }, { status: 400 });
  }

  const raw = await geminiExtractScanDimensions({
    imageMimeType: m[1],
    imageDataBase64: m[2],
    dimensionPrompt: buildScanDimensionPrompt(),
  });
  const dimensions = normalizeScanDimensions(raw);
  if (!dimensions) {
    return NextResponse.json({ dimensions: null });
  }
  return NextResponse.json({ dimensions });
}
