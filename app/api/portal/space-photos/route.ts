import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { addClientSpacePhoto } from "@/lib/client-portal-store";

const MAX_DATA_URL_CHARS = 12_000_000;

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    type?: "image" | "video";
    url?: string;
    caption?: string;
  };

  const url = body.url?.trim() ?? "";
  if (!url) return NextResponse.json({ error: "Media data is required." }, { status: 400 });
  if (url.length > MAX_DATA_URL_CHARS) {
    return NextResponse.json(
      { error: "File is too large for this demo upload. Try a shorter clip or smaller photo." },
      { status: 400 },
    );
  }

  if (body.type !== "image" && body.type !== "video") {
    return NextResponse.json({ error: "type must be image or video." }, { status: 400 });
  }

  try {
    const upload = await addClientSpacePhoto(session.userId, {
      type: body.type,
      url,
      caption: body.caption ?? "",
    });
    return NextResponse.json({ upload });
  } catch {
    return NextResponse.json({ error: "Could not save upload." }, { status: 400 });
  }
}
