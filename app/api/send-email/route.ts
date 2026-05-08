import { NextResponse } from "next/server";
import { sendEmailWithServiceAccount } from "@/lib/gmail-service-account";

type SendEmailBody = {
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendEmailBody;

    const to = body.to?.trim() ?? "";
    const subject = body.subject?.trim() ?? "";
    const text = body.text?.trim() ?? "";
    const html = body.html?.trim();
    const impersonatedUser = process.env.GMAIL_IMPERSONATED_USER?.trim();

    if (!impersonatedUser) {
      return NextResponse.json(
        { error: "Missing GMAIL_IMPERSONATED_USER environment variable." },
        { status: 500 },
      );
    }

    if (!to || !subject || (!text && !html)) {
      return NextResponse.json(
        { error: "Fields required: to, subject, and text (or html)." },
        { status: 400 },
      );
    }

    await sendEmailWithServiceAccount({
      to,
      subject,
      text: text || " ",
      html,
      impersonatedUser,
      fromName: "Level Up Install",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
