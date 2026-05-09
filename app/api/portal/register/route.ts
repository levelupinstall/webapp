import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  createUser,
  deletePortalUserById,
} from "@/lib/client-portal-store";
import {
  normalizePhoneE164,
  portalContactHint,
  portalEmailSiteOrigin,
  portalVerificationConfigured,
  sendPortalSignupVerification,
} from "@/lib/portal-verification-delivery";
import { signPortalSignupVerificationTicket } from "@/lib/portal-verification-ticket";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      email?: string;
      phone?: string;
      verificationChannel?: string;
    };

    const username = body.username?.trim() || "";
    const password = body.password || "";
    const email = body.email?.trim().toLowerCase() || "";
    const phoneRaw = body.phone?.trim() || "";
    const verificationChannel =
      body.verificationChannel === "sms" ? ("sms" as const) : ("email" as const);

    if (!username || !password || !email) {
      return NextResponse.json(
        { error: "Username, email, and password are required." },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    if (verificationChannel === "sms") {
      if (!phoneRaw) {
        return NextResponse.json(
          { error: "Phone number is required when you choose text verification." },
          { status: 400 },
        );
      }
    }

    const phoneE164 = normalizePhoneE164(phoneRaw);
    if (verificationChannel === "sms" && !phoneE164) {
      return NextResponse.json(
        { error: "Enter a valid phone number with country code or a 10-digit number." },
        { status: 400 },
      );
    }

    if (process.env.NODE_ENV === "production" && !portalVerificationConfigured(verificationChannel)) {
      return NextResponse.json(
        {
          error:
            verificationChannel === "email"
              ? "Email verification is not configured on this server (GMAIL_SERVICE_ACCOUNT_KEY + GMAIL_IMPERSONATED_USER)."
              : "Text verification is not configured on this server (Twilio env vars).",
        },
        { status: 503 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { user, verificationCode } = await createUser({
      username,
      email,
      passwordHash,
      phone: phoneE164 ?? "",
      verificationChannel,
    });

    const ticket = signPortalSignupVerificationTicket(user.id);
    const origin = portalEmailSiteOrigin();
    const verificationLink =
      verificationChannel === "email"
        ? `${origin}/api/portal/verify-email?token=${encodeURIComponent(ticket)}`
        : null;

    const sendResult = await sendPortalSignupVerification({
      channel: verificationChannel,
      email,
      phoneE164: phoneE164 ?? "",
      username,
      code: verificationCode,
      verificationLink,
    });

    if (!sendResult.sent) {
      await deletePortalUserById(user.id);
      return NextResponse.json(
        {
          error:
            sendResult.error ||
            "Could not send your verification message. Please try again or contact support.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      needsVerification: true,
      ...(verificationChannel === "sms" ? { verificationTicket: ticket } : {}),
      verificationChannel,
      contactHint: portalContactHint(verificationChannel, email, phoneE164 ?? ""),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
