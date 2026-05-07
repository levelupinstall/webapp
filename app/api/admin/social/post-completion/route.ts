import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { buildJobCompletionCaption } from "@/lib/admin-job-completion-social";
import { publishFacebookPageFeedPost } from "@/lib/facebook-page-publish";
import { getCompletedJobSummaryForSocial } from "@/lib/carpenter-store";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    carpenterId?: string;
    jobId?: string;
    message?: string;
    publishFacebook?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const carpenterId = String(body.carpenterId ?? "").trim();
  const jobId = String(body.jobId ?? "").trim();
  const publishFacebook = Boolean(body.publishFacebook);
  const messageRaw = typeof body.message === "string" ? body.message : "";

  if (!carpenterId || !jobId) {
    return NextResponse.json({ error: "carpenterId and jobId are required." }, { status: 400 });
  }

  const summary = await getCompletedJobSummaryForSocial(carpenterId, jobId);
  if (!summary) {
    return NextResponse.json({ error: "Job not found or not completed." }, { status: 404 });
  }

  if (!publishFacebook) {
    return NextResponse.json({ error: "publishFacebook must be true." }, { status: 400 });
  }

  const brand = process.env.SOCIAL_BRAND_NAME?.trim() || "Our crew";
  const message =
    messageRaw.trim() ||
    buildJobCompletionCaption(
      {
        title: summary.title,
        startDate: summary.startDate,
        clientName: summary.clientName,
        carpenterUsername: summary.carpenterUsername,
        carpenterFullName: summary.carpenterFullName,
      },
      brand,
    );

  const result = await publishFacebookPageFeedPost(message);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    facebookPostId: result.id,
    facebookPermalink: result.id ? `https://www.facebook.com/${result.id}` : undefined,
  });
}
