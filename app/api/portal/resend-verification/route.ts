import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByUsername } from "@/lib/client-portal-store";
import { sendPendingPortalSignupVerification } from "@/lib/portal-pending-verification-send";
import { portalVerificationConfigured } from "@/lib/portal-verification-delivery";

export async function POST(request: Request) {
  try {
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
      return NextResponse.json(
        { error: "Could not send verification. Check your username and password." },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Could not send verification. Check your username and password." },
        { status: 401 },
      );
    }

    if (!user.signupVerificationPending) {
      return NextResponse.json(
        { error: "This account is already verified. Try signing in." },
        { status: 400 },
      );
    }

    const channel = user.verificationChannel === "sms" ? ("sms" as const) : ("email" as const);

    if (process.env.NODE_ENV === "production" && !portalVerificationConfigured(channel)) {
      return NextResponse.json(
        {
          error:
            channel === "email"
              ? "Email verification is not configured on this server."
              : "Text verification is not configured on this server.",
        },
        { status: 503 },
      );
    }

    const result = await sendPendingPortalSignupVerification(user.id);
    if (!result.sent) {
      return NextResponse.json(
        { error: result.error || "Could not send verification message. Try again later." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      verificationChannel: result.verificationChannel,
      contactHint: result.contactHint,
    });
  } catch {
    return NextResponse.json({ error: "Could not send verification." }, { status: 500 });
  }
}
