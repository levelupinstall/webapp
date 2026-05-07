import { NextResponse } from "next/server";
import { addJobUpdate } from "@/lib/carpenter-store";
import { getCarpenterSession } from "@/lib/carpenter-auth";

export async function POST(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    jobId?: string;
    comment?: string;
    message?: string;
    mediaType?: "image" | "video";
    mediaUrl?: string;
    mediaCaption?: string;
    mediaPhase?: "general" | "before" | "after";
    receiptTitle?: string;
    receiptAmountCents?: number;
    receiptImageDataUrl?: string;
    confirmAvailability?: boolean;
  };

  const jobId = body.jobId?.trim() || "";
  if (!jobId) return NextResponse.json({ error: "Job ID is required." }, { status: 400 });

  const job = await addJobUpdate(session.carpenterId, {
    jobId,
    comment: body.comment,
    message: body.message,
    confirmAvailability: body.confirmAvailability === true,
    media:
      body.mediaType && body.mediaUrl
        ? {
            type: body.mediaType,
            url: body.mediaUrl,
            caption: body.mediaCaption || "",
            phase: body.mediaPhase,
          }
        : undefined,
    receipt:
      body.receiptTitle && body.receiptAmountCents
        ? {
            title: body.receiptTitle,
            amountCents: body.receiptAmountCents,
            imageDataUrl: body.receiptImageDataUrl || "",
          }
        : undefined,
  });

  return NextResponse.json({ job });
}

