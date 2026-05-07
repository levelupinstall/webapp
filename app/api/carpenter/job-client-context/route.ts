import { NextResponse } from "next/server";
import { getCarpenterJob } from "@/lib/carpenter-store";
import { getCarpenterSession } from "@/lib/carpenter-auth";
import { getUserPortalData } from "@/lib/client-portal-store";

export async function GET(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() || "";
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

  try {
    const job = await getCarpenterJob(session.carpenterId, jobId);
    const portalId = job.clientPortalUserId?.trim();
    if (!portalId) {
      return NextResponse.json({
        linked: false,
        message: "No client portal account is linked to this job yet.",
        ideas: [],
        aiPlannerActivity: [],
        spacePhotos: [],
      });
    }

    const portal = await getUserPortalData(portalId);
    return NextResponse.json({
      linked: true,
      clientName: portal.fullName || portal.username,
      clientEmail: portal.email,
      serviceAddress: portal.serviceAddress || "",
      ideas: portal.ideas,
      aiPlannerActivity: portal.aiPlannerActivity ?? [],
      spacePhotos: portal.spacePhotos ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Could not load client context." }, { status: 400 });
  }
}
