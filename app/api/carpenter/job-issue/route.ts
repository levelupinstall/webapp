import { NextResponse } from "next/server";
import { addJobIssueReport } from "@/lib/carpenter-store";
import { getCarpenterSession } from "@/lib/carpenter-auth";

export async function POST(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    jobId?: string;
    notes?: string;
    photos?: { url: string; caption?: string }[];
  };

  const jobId = body.jobId?.trim() || "";
  if (!jobId) return NextResponse.json({ error: "Job ID is required." }, { status: 400 });

  try {
    const job = await addJobIssueReport(session.carpenterId, jobId, {
      notes: body.notes ?? "",
      photos: body.photos ?? [],
    });
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save issue report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
