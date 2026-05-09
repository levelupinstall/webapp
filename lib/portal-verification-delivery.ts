import { sendEmailWithServiceAccount } from "@/lib/gmail-service-account";
import { resolveSiteOrigin } from "@/lib/site-origin";

export type PortalVerificationChannel = "email" | "sms";

function gmailSignupEmailConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_SERVICE_ACCOUNT_KEY?.trim() &&
      process.env.GMAIL_IMPERSONATED_USER?.trim(),
  );
}

/** Site origin for absolute URLs in outbound email (no trailing slash). */
export function portalEmailSiteOrigin(request?: Request): string {
  return resolveSiteOrigin(request);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSignupVerificationEmailHtml(params: {
  username: string;
  verificationLink: string;
  logoUrl: string;
}): string {
  const firstName = params.username.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
  const safeLink = escapeHtml(params.verificationLink);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background-color:#f6f1ff;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f1ff;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8d9ff;box-shadow:0 8px 28px rgba(47,23,72,0.08);">
<tr><td style="padding:28px 28px 12px;text-align:center;background:linear-gradient(180deg,#faf6ff 0%,#ffffff 100%);">
<img src="${escapeHtml(params.logoUrl)}" alt="Level Up Install" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;"/>
</td></tr>
<tr><td style="padding:8px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2f1748;font-size:16px;line-height:1.55;">
<p style="margin:0 0 16px;font-size:17px;">${greeting}</p>
<p style="margin:0 0 16px;">Thanks for joining the <strong>Level Up Install</strong> client portal. We are glad you are here — this is where you will save project ideas, track progress, and handle invoices in one place.</p>
<p style="margin:0 0 20px;">To finish setting up your account, confirm your email with the button below. It only takes a moment, and the link expires in 24 hours.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
<tr><td style="border-radius:999px;background:#6e3eb2;">
<a href="${safeLink}" style="display:inline-block;padding:14px 28px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Confirm my email</a>
</td></tr>
</table>
<p style="margin:0 0 12px;font-size:13px;color:#6a4a8f;">If the button does not work, copy and paste this link into your browser:</p>
<p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#5b3292;">${safeLink}</p>
<p style="margin:0;font-size:14px;color:#6a4a8f;">If you did not create an account with us, you can safely ignore this email.</p>
<p style="margin:20px 0 0;font-size:14px;color:#2f1748;">Warm regards,<br/><strong>Level Up Install</strong></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function portalVerificationConfigured(channel: PortalVerificationChannel): boolean {
  if (channel === "email") {
    return gmailSignupEmailConfigured();
  }
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

export function portalContactHint(
  channel: PortalVerificationChannel,
  email: string,
  phoneE164: string,
): string {
  if (channel === "email") {
    const [local, domain] = email.split("@");
    if (!domain) return "your email";
    const prefix = local.length <= 1 ? "*" : `${local.slice(0, 1)}***`;
    return `${prefix}@${domain}`;
  }
  const digits = phoneE164.replace(/\D/g, "");
  const last = digits.slice(-4);
  return last.length === 4 ? `***${last}` : "your phone";
}

export async function sendPortalSignupVerification(params: {
  channel: PortalVerificationChannel;
  email: string;
  phoneE164: string;
  username: string;
  /** SMS-only; omitted when verifying by email link */
  code?: string | null;
  /** Absolute HTTPS URL for magic-link email verification */
  verificationLink?: string | null;
  /** Infer public URL for logo when building links from the API request */
  request?: Request | null;
}): Promise<{ sent: boolean; error?: string }> {
  const greet = params.username.trim() ? `, ${params.username.trim()}` : "";

  if (params.channel === "email") {
    const subject = "Welcome — confirm your Level Up Install portal email";
    const link = params.verificationLink?.trim();
    if (!link) {
      return { sent: false, error: "Missing verification link for email signup." };
    }
    const logoUrl = `${portalEmailSiteOrigin(params.request ?? undefined)}/level-up-install-logo.png`;
    const text = `Welcome${greet}!

Thank you for creating a Level Up Install client portal account. We are excited to help you plan your project.

Confirm your email by opening this link (valid for 24 hours):
${link}

If you did not sign up, you can ignore this message.

— Level Up Install`;

    const html = buildSignupVerificationEmailHtml({
      username: params.username,
      verificationLink: link,
      logoUrl,
    });

    return sendSignupEmail(params.email, subject, text, html);
  }

  const code = params.code?.trim();
  if (!code) {
    return { sent: false, error: "Missing verification code for SMS signup." };
  }

  const body = `Welcome${greet}! Your Level Up client portal verification code is: ${code}

Enter this code on the site to confirm your account.

If you didn't sign up, you can ignore this message.`;

  const subject = "Verify your Level Up client portal account";
  return sendSignupSms(params.phoneE164, body);
}

async function sendSignupEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<{ sent: boolean; error?: string }> {
  if (!gmailSignupEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[portal-verify] Email (Gmail not configured) → ${to}\n${text}`);
      return { sent: true };
    }
    return {
      sent: false,
      error:
        "Email delivery is not configured (GMAIL_SERVICE_ACCOUNT_KEY / GMAIL_IMPERSONATED_USER).",
    };
  }

  try {
    const impersonatedUser = process.env.GMAIL_IMPERSONATED_USER!.trim();
    await sendEmailWithServiceAccount({
      to,
      subject,
      text,
      html,
      impersonatedUser,
      fromName: "Level Up Install",
    });
    return { sent: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send verification email.";
    return { sent: false, error: message };
  }
}

async function sendSignupSms(
  toE164: string,
  body: string,
): Promise<{ sent: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNum = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !fromNum) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[portal-verify] SMS (Twilio not configured) → ${toE164}\n${body}`);
      return { sent: true };
    }
    return {
      sent: false,
      error:
        "SMS delivery is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
    };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({ To: toE164, From: fromNum, Body: body });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { sent: false, error: errBody || `Twilio HTTP ${res.status}` };
  }
  return { sent: true };
}
