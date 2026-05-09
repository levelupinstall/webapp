import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  adminMarkWorkProposalSent,
  appendPortalCommunication,
  getPortalUserById,
  getWorkProposalById,
} from "@/lib/client-portal-store";
import { sendEmailWithServiceAccount } from "@/lib/gmail-service-account";

type Body = {
  portalUserId?: string;
  proposalId?: string;
};

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const impersonatedUser = process.env.GMAIL_IMPERSONATED_USER?.trim();
  if (!impersonatedUser) {
    return NextResponse.json(
      { error: "Email not configured (GMAIL_IMPERSONATED_USER)." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const portalUserId = String(body.portalUserId ?? "").trim();
  const proposalId = String(body.proposalId ?? "").trim();
  if (!portalUserId || !proposalId) {
    return NextResponse.json({ error: "portalUserId and proposalId required." }, { status: 400 });
  }

  const before = await getWorkProposalById(portalUserId, proposalId);
  if (!before) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  if (before.status === "paid") {
    return NextResponse.json({ error: "Proposal already paid." }, { status: 400 });
  }
  if (before.paymentAmountCents < 100) {
    return NextResponse.json({ error: "Set a valid payment amount (cents) before sending." }, { status: 400 });
  }

  const profile = await getPortalUserById(portalUserId);
  if (!profile?.email) {
    return NextResponse.json({ error: "Client email missing." }, { status: 400 });
  }

  await adminMarkWorkProposalSent({ portalUserId, proposalId });
  const proposal = await getWorkProposalById(portalUserId, proposalId);
  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  const origin =
    request.headers.get("origin")?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(request.url).origin;

  const link = `${origin.replace(/\/$/, "")}/portal/proposal?t=${encodeURIComponent(proposal.viewToken)}`;

  const subject = `Your Level Up proposal: ${proposal.title}`;
  const text = `Hi ${profile.fullName || "there"},

Please review your formal project proposal from Level Up Install:
${link}

After you accept the terms in the document, you can complete payment securely online.

Thank you,
Level Up Install`;

  const html = `<p>Hi ${escapeHtml(profile.fullName || "there")},</p>
<p>Please review your formal project proposal:</p>
<p><a href="${escapeAttr(link)}">${escapeHtml(link)}</a></p>
<p>After you accept the terms on that page, you can complete payment securely online.</p>
<p>Thank you,<br/>Level Up Install</p>`;

  await sendEmailWithServiceAccount({
    to: profile.email,
    subject,
    text,
    html,
    impersonatedUser,
    fromName: "Level Up Install",
  });

  await appendPortalCommunication({
    portalUserId,
    channel: "email",
    summary: `Sent work proposal (“${proposal.title.slice(0, 80)}”)`,
    detail: link,
    recordedBy: "admin",
  });

  return NextResponse.json({ ok: true, proposal });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
