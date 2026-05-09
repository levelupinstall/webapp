import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/client-portal-auth";
import { findUserByUsername, recordPortalLogin } from "@/lib/client-portal-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username?.trim() || "";
  const password = body.password || "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  const user = await findUserByUsername(username);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (user.signupVerificationPending) {
    return NextResponse.json(
      {
        error:
          "Please confirm your email first. Check your inbox for the welcome message with a confirmation link.",
      },
      { status: 403 },
    );
  }

  await setSessionCookie({ userId: user.id, username: user.username });
  await recordPortalLogin(user.id);
  return NextResponse.json({
    user: { id: user.id, username: user.username, email: user.email },
  });
}

