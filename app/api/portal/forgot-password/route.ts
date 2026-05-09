import { NextResponse } from "next/server";
import {
  beginPortalPasswordReset,
  clearPortalPasswordResetChallenge,
} from "@/lib/client-portal-store";
import {
  portalEmailSiteOrigin,
  portalVerificationConfigured,
  sendPortalPasswordResetEmail,
} from "@/lib/portal-verification-delivery";

const GENERIC_RESPONSE = {
  ok: true as const,
  message:
    "If an account exists for that email and it is verified, we sent password reset instructions.",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim() ?? "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    if (process.env.NODE_ENV === "production" && !portalVerificationConfigured("email")) {
      return NextResponse.json(
        {
          error:
            "Password reset email is not configured on this server (GMAIL_SERVICE_ACCOUNT_KEY + GMAIL_IMPERSONATED_USER).",
        },
        { status: 503 },
      );
    }

    const challenge = await beginPortalPasswordReset(email);
    if (!challenge) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const origin = portalEmailSiteOrigin(request);
    const resetLink = `${origin}/portal/reset-password?token=${encodeURIComponent(challenge.plainToken)}`;

    const sent = await sendPortalPasswordResetEmail({
      username: challenge.username,
      email: challenge.toEmail,
      resetLink,
    });

    if (!sent.sent) {
      await clearPortalPasswordResetChallenge(challenge.userId);
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: sent.error ?? "Could not send reset email. Please try again later." },
          { status: 502 },
        );
      }
      console.info(`[portal-reset] Email failed (dev); reset link for ${challenge.toEmail}: ${resetLink}`);
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch {
    return NextResponse.json({ error: "Could not process request." }, { status: 500 });
  }
}
