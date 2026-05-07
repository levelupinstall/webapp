import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { appendPortalCommunication } from "@/lib/client-portal-store";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    portalUserId?: string;
    channel?: string;
    summary?: string;
    detail?: string;
  };

  const portalUserId = String(body.portalUserId ?? "").trim();
  const summary = String(body.summary ?? "").trim();
  const channel = body.channel;

  if (!portalUserId || !summary) {
    return NextResponse.json(
      { error: "portalUserId and summary are required." },
      { status: 400 },
    );
  }

  if (channel !== "email" && channel !== "sms" && channel !== "app_notice") {
    return NextResponse.json({ error: "channel must be email, sms, or app_notice." }, { status: 400 });
  }

  try {
    await appendPortalCommunication({
      portalUserId,
      channel,
      summary,
      detail: body.detail?.trim() || undefined,
      recordedBy: "admin",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
