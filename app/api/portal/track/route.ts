import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { incrementPortalAnalytics } from "@/lib/client-portal-store";

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { kind?: string };
  const kind = body.kind;

  if (kind === "saved_projects_section") {
    await incrementPortalAnalytics(session.userId, "savedProjectsSectionOpens");
    return NextResponse.json({ ok: true });
  }
  if (kind === "space_photos_section") {
    await incrementPortalAnalytics(session.userId, "spacePhotosSectionOpens");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
}
