import { NextResponse } from "next/server";
import { getCarpenterJob } from "@/lib/carpenter-store";
import { getCarpenterSession } from "@/lib/carpenter-auth";
import { getEstimateById, getWorkProposalById } from "@/lib/client-portal-store";
import { shopPacketToSvg } from "@/lib/shop-packet";

/**
 * Shop drawings for the assigned installer: dimensioned elevation + element
 * schedule + install steps, generated from the approved design and the real
 * site measurements. All dimensions in inches.
 */
export async function GET(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() || "";
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

  try {
    const job = await getCarpenterJob(session.carpenterId, jobId);
    const intake = job.formalProposalIntake;
    if (!intake) {
      return NextResponse.json({ linked: false, message: "This job is not linked to a proposal yet." });
    }

    const proposal = await getWorkProposalById(intake.portalUserId, intake.proposalId);
    const estimateId = proposal?.sourceEstimateId;
    if (!proposal || !estimateId) {
      return NextResponse.json({ linked: false, message: "No estimate is linked to this job yet." });
    }

    const estimate = await getEstimateById(intake.portalUserId, estimateId);
    const packet = estimate?.shopPacket;
    if (!packet) {
      return NextResponse.json({
        linked: false,
        message: "Shop drawings have not been generated for this job yet. Ask Tom.",
      });
    }

    return NextResponse.json({
      linked: true,
      jobTitle: job.title,
      crewSize: estimate?.crewSize ?? 1,
      crewReason: estimate?.crewReason ?? "",
      estimatedManHours: estimate?.laborHours ?? job.estimatedHours ?? 0,
      packet,
      svg: shopPacketToSvg(packet),
    });
  } catch {
    return NextResponse.json({ error: "Could not load shop drawings." }, { status: 400 });
  }
}
