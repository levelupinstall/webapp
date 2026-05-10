import { NextResponse } from "next/server";

import { revalidateAdminDashboard } from "@/lib/admin-revalidate";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { getPortalUserById } from "@/lib/client-portal-store";
import { executePlannerSubmitDesignPipeline } from "@/lib/planner-submit-design-pipeline";
import { parsePlannerSubmitMultipart } from "@/lib/planner-submit-parse-request";

export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const portalProfile = await getPortalUserById(session.userId);
  if (!portalProfile) {
    return NextResponse.json({ error: "Portal profile not found." }, { status: 400 });
  }

  const parsed = await parsePlannerSubmitMultipart(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const origin =
    request.headers.get("origin")?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(request.url).origin;

  try {
    const result = await executePlannerSubmitDesignPipeline({
      parsed: parsed.data,
      portalUserId: session.userId,
      portalProfile,
      origin,
    });

    revalidateAdminDashboard();

    return NextResponse.json({
      proposalId: result.proposalId,
      jobId: result.jobId,
      immediateCheckoutUrl: result.immediateCheckoutUrl,
      laborHoldCheckoutUrl: result.laborHoldCheckoutUrl,
      stripeConfigured: result.stripeConfigured,
      ...(result.stripeError ? { stripeWarning: result.stripeError } : {}),
      message:
        "Design submitted. Complete checkout for call-out & materials; labor hold applies when estimated hours exceed the included window.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Planner submit pipeline failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
