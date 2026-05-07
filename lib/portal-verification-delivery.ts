export type PortalVerificationChannel = "email" | "sms";

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
    return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
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
  code: string;
}): Promise<{ sent: boolean; error?: string }> {
  const greet = params.username.trim() ? `, ${params.username.trim()}` : "";
  const body = `Welcome${greet}! Your Level Up client portal verification code is: ${params.code}

Enter this code on the site to confirm your account.

If you didn't sign up, you can ignore this message.`;

  const subject = "Verify your Level Up client portal account";

  if (params.channel === "email") {
    return sendSignupEmail(params.email, subject, body);
  }
  return sendSignupSms(params.phoneE164, body);
}

async function sendSignupEmail(
  to: string,
  subject: string,
  text: string,
): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[portal-verify] Email (RESEND not configured) → ${to}\n${text}`);
      return { sent: true };
    }
    return { sent: false, error: "Email delivery is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { sent: false, error: errBody || `Resend HTTP ${res.status}` };
  }
  return { sent: true };
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
      error: "SMS delivery is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
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
