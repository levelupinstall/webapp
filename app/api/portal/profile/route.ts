import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { updateUserProfile } from "@/lib/client-portal-store";

const MAX_AVATAR_BYTES = 1_500_000;

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      fullName?: string;
      serviceAddress?: string;
      avatarDataUrl?: string;
    };

    const fullName = (body.fullName || "").trim();
    const serviceAddress = (body.serviceAddress || "").trim();
    const avatarDataUrl = (body.avatarDataUrl || "").trim();

    if (!fullName || !serviceAddress) {
      return NextResponse.json(
        { error: "Full name and service address are required." },
        { status: 400 },
      );
    }

    if (avatarDataUrl && avatarDataUrl.length > MAX_AVATAR_BYTES * 1.5) {
      return NextResponse.json(
        { error: "Display picture is too large. Please use a smaller image." },
        { status: 400 },
      );
    }

    const user = await updateUserProfile(session.userId, {
      fullName,
      serviceAddress,
      avatarDataUrl,
    });

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json(
      { error: "Could not update profile right now." },
      { status: 500 },
    );
  }
}

