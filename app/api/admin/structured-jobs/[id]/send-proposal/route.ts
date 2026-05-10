import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { getAdminSession } from "@/lib/admin-auth";
import {
  adminMarkWorkProposalSent,
  adminPatchWorkProposal,
  appendPortalCommunication,
  getPortalUserById,
  getWorkProposalById,
} from "@/lib/client-portal-store";
import { sendEmailWithServiceAccount } from "@/lib/gmail-service-account";
import {
  normalizePhoneE164,
  sendTwilioTextMessage,
} from "@/lib/portal-verification-delivery";
import { revalidateAdminDashboard } from "@/lib/admin-revalidate";
import { prisma } from "@/lib/prisma";
import { createPlannerSubmitStripeSessions } from "@/lib/planner-submit-design-stripe";
import {
  buildStructuredJobProposalAppendixMarkdown,
  mergeStructuredJobBillingAppendix,
} from "@/lib/structured-job-proposal-appendix";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) {
    return jsonError("Unauthorized.", 401);
  }

  const impersonatedUser = process.env.GMAIL_IMPERSONATED_USER?.trim();
  if (!impersonatedUser) {
    return jsonError("Email not configured (GMAIL_IMPERSONATED_USER).", 503);
  }

  const { id } = await context.params;
  const jobId = id.trim();
  if (!jobId) {
    return jsonError("Missing job id.", 400);
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return jsonError("Job not found.", 404);
  }

  if (job.status !== "PENDING_REVIEW") {
    return jsonError(
      `Job must be PENDING_REVIEW to send from admin review (current: ${job.status}).`,
      400,
    );
  }

  const portalUserId = job.portalUserId?.trim();
  const proposalId = job.workProposalId?.trim();
  if (!portalUserId || !proposalId) {
    return jsonError(
      "This job is missing portal_user_id or work_proposal_id — cannot attach a formal proposal.",
      400,
    );
  }

  const proposalBefore = await getWorkProposalById(portalUserId, proposalId);
  if (!proposalBefore) {
    return jsonError("Linked work proposal not found.", 404);
  }
  if (proposalBefore.status === "paid") {
    return jsonError("Proposal already paid.", 400);
  }

  const profile = await getPortalUserById(portalUserId);
  if (!profile?.email?.trim()) {
    return jsonError("Client email missing on portal profile.", 400);
  }

  const email = job.customerEmail.trim() || profile.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Add a valid customer email on the job or portal profile.", 400);
  }

  const originHeader = request.headers.get("origin");
  const originRaw =
    originHeader?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(request.url).origin;
  const origin = originRaw.replace(/\/$/, "");

  const immediateCents = Math.max(
    100,
    job.paymentAmountCents ?? Math.round(job.immediateCharge * 100),
  );
  const laborHoldCents = Math.max(0, Math.round(job.totalLaborHold * 100));

  const token = proposalBefore.viewToken.trim();
  const returnUrls = {
    immediateSuccessUrl: `${origin}/portal/proposal?t=${encodeURIComponent(token)}&checkout_kind=immediate_ok&session_id={CHECKOUT_SESSION_ID}`,
    immediateCancelUrl: `${origin}/portal/proposal?t=${encodeURIComponent(token)}&checkout=cancelled`,
    laborSuccessUrl: `${origin}/portal/proposal?t=${encodeURIComponent(token)}&checkout_kind=labor_hold_ok&session_id={CHECKOUT_SESSION_ID}`,
    laborCancelUrl: `${origin}/portal/proposal?t=${encodeURIComponent(token)}&checkout=labor_cancelled`,
  };

  let sessions;
  try {
    sessions = await createPlannerSubmitStripeSessions({
      origin,
      jobId: job.id,
      proposalId,
      portalUserId,
      customerEmail: email,
      immediateAmountCents: immediateCents,
      laborHoldAmountCents: laborHoldCents,
      returnUrls,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error.";
    return jsonError(message, 503);
  }

  if (!sessions) {
    return jsonError("Stripe is not configured (STRIPE_SECRET_KEY).", 503);
  }

  const appendix = buildStructuredJobProposalAppendixMarkdown({
    scopeOfWorkTerms: job.scopeOfWorkTerms,
    immediateCheckoutUrl: sessions.immediateCheckoutUrl,
    laborHoldCheckoutUrl: sessions.laborHoldCheckoutUrl,
    immediateChargeCad: immediateCents / 100,
    laborHoldCad: laborHoldCents / 100,
  });

  const mergedMarkdown = mergeStructuredJobBillingAppendix(
    proposalBefore.markdownBody,
    appendix,
  );

  const patched = await adminPatchWorkProposal({
    portalUserId,
    proposalId,
    markdownBody: mergedMarkdown,
    paymentAmountCents: immediateCents,
  });

  if (!patched) {
    return jsonError("Could not update proposal markdown.", 500);
  }

  const prevLb =
    job.laborBreakdown &&
    typeof job.laborBreakdown === "object" &&
    !Array.isArray(job.laborBreakdown)
      ? ({ ...(job.laborBreakdown as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  prevLb.adminSend = {
    sentAt: new Date().toISOString(),
    immediateSessionId: sessions.immediateSessionId,
    laborHoldSessionId: sessions.laborHoldSessionId,
    immediateAmountCents: immediateCents,
    laborHoldAmountCents: laborHoldCents,
    laborHoldSkippedReason: sessions.laborHoldSkippedReason ?? null,
  };

  await prisma.job.update({
    where: { id: job.id },
    data: {
      customerEmail: email,
      status: "PROPOSAL_SENT",
      stripeCheckoutSessionId: sessions.immediateSessionId,
      stripeLaborHoldCheckoutSessionId: sessions.laborHoldSessionId,
      paymentAmountCents: immediateCents,
      laborBreakdown: prevLb as Prisma.InputJsonValue,
    },
  });

  revalidateAdminDashboard();

  await adminMarkWorkProposalSent({ portalUserId, proposalId });
  const proposal = await getWorkProposalById(portalUserId, proposalId);
  if (!proposal) {
    return jsonError("Proposal not found after send.", 500);
  }

  const proposalLink = `${origin}/portal/proposal?t=${encodeURIComponent(proposal.viewToken)}`;

  const subject = `Your Level Up proposal: ${proposal.title}`;
  const textLines = [
    `Hi ${profile.fullName || "there"},`,
    "",
    "Your formal proposal — including scope of work, billing terms, and secure checkout links — is ready:",
    proposalLink,
    "",
    `Pay call-out & materials now (${(immediateCents / 100).toFixed(2)} CAD):`,
    sessions.immediateCheckoutUrl,
  ];
  if (sessions.laborHoldCheckoutUrl && laborHoldCents > 0) {
    textLines.push(
      "",
      `Labor authorization hold (${(laborHoldCents / 100).toFixed(2)} CAD — manual capture):`,
      sessions.laborHoldCheckoutUrl,
    );
  }
  textLines.push("", "Thank you,", "Level Up Install");

  const html = `<p>Hi ${escapeHtml(profile.fullName || "there")},</p>
<p>Your formal proposal — including <strong>scope of work</strong>, <strong>billing terms</strong>, and <strong>secure checkout</strong> — is ready:</p>
<p><a href="${escapeAttr(proposalLink)}">${escapeHtml(proposalLink)}</a></p>
<p><strong>Call-out &amp; materials</strong> (${escapeHtml((immediateCents / 100).toFixed(2))} CAD):<br/>
<a href="${escapeAttr(sessions.immediateCheckoutUrl)}">${escapeHtml(sessions.immediateCheckoutUrl)}</a></p>
${
  sessions.laborHoldCheckoutUrl && laborHoldCents > 0
    ? `<p><strong>Labor authorization hold</strong> (${escapeHtml((laborHoldCents / 100).toFixed(2))} CAD, manual capture):<br/>
<a href="${escapeAttr(sessions.laborHoldCheckoutUrl)}">${escapeHtml(sessions.laborHoldCheckoutUrl)}</a></p>`
    : ""
}
<p>Thank you,<br/>Level Up Install</p>`;

  await sendEmailWithServiceAccount({
    to: email,
    subject,
    text: textLines.join("\n"),
    html,
    impersonatedUser,
    fromName: "Level Up Install",
  });

  await appendPortalCommunication({
    portalUserId,
    channel: "email",
    summary: `Sent structured job proposal (“${proposal.title.slice(0, 72)}”)`,
    detail: proposalLink,
    recordedBy: "admin",
  });

  const phoneRaw = (job.customerPhone || profile.phone || "").trim();
  const phoneE164 = normalizePhoneE164(phoneRaw);
  let smsSent = false;
  if (phoneE164) {
    const smsBody = [
      "Level Up Install — your proposal is ready.",
      proposalLink,
      `Pay call-out & materials: ${sessions.immediateCheckoutUrl}`,
      sessions.laborHoldCheckoutUrl && laborHoldCents > 0
        ? `Labor hold: ${sessions.laborHoldCheckoutUrl}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1580);

    const smsRes = await sendTwilioTextMessage(phoneE164, smsBody);
    smsSent = smsRes.sent;
    if (smsSent) {
      await appendPortalCommunication({
        portalUserId,
        channel: "sms",
        summary: `SMS — proposal link (“${proposal.title.slice(0, 48)}”)`,
        detail: proposalLink,
        recordedBy: "admin",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    proposal,
    immediateCheckoutUrl: sessions.immediateCheckoutUrl,
    laborHoldCheckoutUrl: sessions.laborHoldCheckoutUrl,
    proposalLink,
    smsSent,
  });
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
