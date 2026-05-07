import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { addIdeaForUser, getUserPortalData } from "@/lib/client-portal-store";

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserPortalData(session.userId);
  return NextResponse.json({ ideas: user.ideas });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { title?: string; notes?: string };
  const title = body.title?.trim() || "";
  const notes = body.notes?.trim() || "";

  if (!title || !notes) {
    return NextResponse.json(
      { error: "Idea title and notes are required." },
      { status: 400 },
    );
  }

  const idea = await addIdeaForUser(session.userId, { title, notes });
  return NextResponse.json({ idea });
}

