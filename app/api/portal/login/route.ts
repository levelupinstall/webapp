import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/client-portal-auth";
import { findPortalUserForLogin, recordPortalLogin } from "@/lib/client-portal-store";
import {
  normalizePhoneE164,
  portalContactHint,
} from "@/lib/portal-verification-delivery";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    username?: string;
    password?: string;
  };
  const identifier = (body.email ?? body.username)?.trim() || "";
  const password = body.password || "";

  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const user = await findPortalUserForLogin(identifier);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (user.signupVerificationPending) {
    const channel = user.verificationChannel === "sms" ? ("sms" as const) : ("email" as const);
    const phoneE164 = normalizePhoneE164(user.phone ?? "") ?? "";
    return NextResponse.json(
      {
        error:
          channel === "sms"
            ? "Your account is not verified yet. Check your phone for a text message with your verification code."
            : "Your account is not verified yet. Check your inbox and spam folder for an email with a confirmation link to activate your account.",
        needsVerification: true,
        verificationChannel: channel,
        contactHint: portalContactHint(channel, user.email, phoneE164),
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

