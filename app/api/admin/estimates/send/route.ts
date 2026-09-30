import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  appendPortalCommunication,
  getEstimateById,
  getPortalUserById,
  setEstimateStatus,
  setPortalUserProjectPhase,
} from "@/lib/client-portal-store";
import { SALES_PIPELINE_PHASES } from "@/lib/planner-sales-handoff";
import { sendEmailWithServiceAccount } from "@/lib/gmail-service-account";
import type { Estimate } from "@/lib/planner-estimate";

type Body = { portalUserId?: string; estimateId?: string };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function estimateEmailHtml(estimate: Estimate, clientName: string): string {
  const rows = estimate.lineItems
    .map((it) => {
      const type =
        it.category === "material"
          ? it.sourcing === "buy"
            ? "Buy"
            : "Build"
          : it.category === "labor"
            ? "Labour"
            : "Fee";
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${esc(it.description)}${it.detail ? `<br><span style="color:#777;font-size:12px;">${esc(it.detail)}</span>` : ""}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${type}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${it.quantity} ${esc(it.unit)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${it.totalCad.toFixed(2)}</td>
      </tr>`;
    })
    .join("");
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#222;">
    <h2 style="margin-bottom:4px;">Your project estimate</h2>
    <p>Hi ${esc(clientName)},</p>
    <p>Thanks for exploring your project with our AI planner. Based on the design you liked, here is a preliminary estimate from <strong>Level Up Install</strong>:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead><tr style="text-align:left;color:#555;">
        <th style="padding:8px;border-bottom:2px solid #ddd;">Item</th>
        <th style="padding:8px;border-bottom:2px solid #ddd;">Type</th>
        <th style="padding:8px;border-bottom:2px solid #ddd;">Qty</th>
        <th style="padding:8px;border-bottom:2px solid #ddd;text-align:right;">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:16px;"><strong>Estimated total: $${estimate.totalCad.toFixed(2)} CAD</strong>
    <br><span style="color:#777;font-size:13px;">Materials $${estimate.materialsTotalCad.toFixed(2)} · Labour (${estimate.laborHours}h) $${estimate.laborTotalCad.toFixed(2)} · Fees $${estimate.feesTotalCad.toFixed(2)}</span></p>
    ${estimate.notes.trim() ? `<p><strong>Notes:</strong> ${esc(estimate.notes.trim())}</p>` : ""}
    <p style="color:#777;font-size:13px;">This is a preliminary estimate — final measurements are confirmed on site before work is scheduled. "Buy" items are premade products we procure for you; "Build" items are custom-fabricated by our shop.</p>
    <p>Tom will call you shortly to walk through it and answer any questions.</p>
    <p>— Level Up Install</p>
  </div>`;
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const impersonatedUser = process.env.GMAIL_IMPERSONATED_USER?.trim();
  if (!impersonatedUser) {
    return NextResponse.json({ error: "Email not configured (GMAIL_IMPERSONATED_USER)." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const portalUserId = String(body.portalUserId ?? "").trim();
  const estimateId = String(body.estimateId ?? "").trim();
  if (!portalUserId || !estimateId) {
    return NextResponse.json({ error: "portalUserId and estimateId required." }, { status: 400 });
  }

  const estimate = await getEstimateById(portalUserId, estimateId);
  if (!estimate) return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  if (estimate.lineItems.length === 0) {
    return NextResponse.json({ error: "Estimate has no line items." }, { status: 400 });
  }

  const profile = await getPortalUserById(portalUserId);
  const email = profile?.email?.trim();
  if (!email || !profile) return NextResponse.json({ error: "Client email missing." }, { status: 400 });
  const clientName = profile.fullName?.trim() || "there";

  const text = [
    `Hi ${clientName},`,
    ``,
    `Thanks for exploring your project with our AI planner. Based on the design you liked, here is a preliminary estimate from Level Up Install:`,
    ``,
    ...estimate.lineItems.map(
      (it) => `- ${it.description} (${it.quantity} ${it.unit}): $${it.totalCad.toFixed(2)}`,
    ),
    ``,
    `Estimated total: $${estimate.totalCad.toFixed(2)} CAD`,
    `Materials $${estimate.materialsTotalCad.toFixed(2)} · Labour (${estimate.laborHours}h) $${estimate.laborTotalCad.toFixed(2)} · Fees $${estimate.feesTotalCad.toFixed(2)}`,
    ``,
    ...(estimate.notes.trim() ? [`Notes: ${estimate.notes.trim()}`, ``] : []),
    `This is a preliminary estimate — final measurements are confirmed on site before work is scheduled.`,
    `Tom will call you shortly to walk through it and answer any questions.`,
    ``,
    `— Level Up Install`,
  ].join("\n");

  await sendEmailWithServiceAccount({
    to: email,
    subject: `Your Level Up Install project estimate — $${estimate.totalCad.toFixed(2)} CAD`,
    text,
    html: estimateEmailHtml(estimate, clientName),
    impersonatedUser,
    fromName: "Level Up Install",
  });

  await setEstimateStatus({ portalUserId, estimateId, status: "sent" });
  await setPortalUserProjectPhase({
    portalUserId,
    phase: SALES_PIPELINE_PHASES.estimateSent,
    details: `Estimate emailed to ${email} ($${estimate.totalCad.toFixed(2)} CAD). Awaiting discussion / site measure.`,
  });
  await appendPortalCommunication({
    portalUserId,
    channel: "email",
    summary: `Estimate emailed to customer — $${estimate.totalCad.toFixed(2)} CAD`,
    recordedBy: "Tom",
  });

  return NextResponse.json({ ok: true });
}
