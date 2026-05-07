import { NextResponse } from "next/server";
import { addJobSiteMedia, type JobMediaPhase } from "@/lib/carpenter-store";
import { getCarpenterSession } from "@/lib/carpenter-auth";

export async function POST(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    jobId?: string;
    type?: "image" | "video";
    url?: string;
    caption?: string;
    phase?: JobMediaPhase;
  };

  const jobId = body.jobId?.trim() || "";
  if (!jobId) return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
  if (body.type !== "image" && body.type !== "video") {
    return NextResponse.json({ error: "type must be image or video." }, { status: 400 });
  }

  const phase: JobMediaPhase =
    body.phase === "before" || body.phase === "after" ? body.phase : "general";

  try {
    const job = await addJobSiteMedia(session.carpenterId, jobId, {
      type: body.type,
      url: body.url ?? "",
      caption: body.caption ?? "",
      phase,
    });
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save media.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
