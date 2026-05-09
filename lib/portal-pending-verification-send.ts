import { regeneratePortalSignupVerificationCode } from "@/lib/client-portal-store";
import { prisma } from "@/lib/prisma";
import {
  normalizePhoneE164,
  portalContactHint,
  portalEmailSiteOrigin,
  sendPortalSignupVerification,
} from "@/lib/portal-verification-delivery";
import { signPortalSignupVerificationTicket } from "@/lib/portal-verification-ticket";

export async function sendPendingPortalSignupVerification(userId: string): Promise<{
  sent: boolean;
  error?: string;
  verificationChannel: "email" | "sms";
  contactHint: string;
}> {
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row?.signupVerificationPending) {
    return {
      sent: false,
      error: "This account is not waiting for verification.",
      verificationChannel: "email",
      contactHint: "",
    };
  }

  const channel = row.verificationChannel === "sms" ? ("sms" as const) : ("email" as const);
  const verificationCode = await regeneratePortalSignupVerificationCode(userId);
  const ticket = signPortalSignupVerificationTicket(userId);
  const origin = portalEmailSiteOrigin();
  const verificationLink =
    channel === "email"
      ? `${origin}/api/portal/verify-email?token=${encodeURIComponent(ticket)}`
      : null;

  const phoneE164 = normalizePhoneE164(row.phone ?? "") ?? "";

  const sendResult = await sendPortalSignupVerification({
    channel,
    email: row.email,
    phoneE164,
    username: row.username,
    code: verificationCode,
    verificationLink,
  });

  return {
    sent: sendResult.sent,
    error: sendResult.error,
    verificationChannel: channel,
    contactHint: portalContactHint(channel, row.email, phoneE164),
  };
}
