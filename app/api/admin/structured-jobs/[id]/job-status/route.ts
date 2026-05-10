import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { revalidateAdminStructuredJobViews } from "@/lib/admin-revalidate";
import { getAdminSession } from "@/lib/admin-auth";
import {
  canMarkCompleted,
  canMockPaymentSuccess,
  canSendProposalStatus,
} from "@/lib/structured-job-status-flow";
import { prisma } from "@/lib/prisma";

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

  const { id } = await context.params;
  const jobId = id.trim();
  if (!jobId) {
    return jsonError("Missing job id.", 400);
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const action = body.action?.trim();
  if (
    action !== "send_proposal" &&
    action !== "mock_payment_success" &&
    action !== "mark_completed"
  ) {
    return jsonError(
      "Unknown action. Use send_proposal, mock_payment_success, or mark_completed.",
      400,
    );
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return jsonError("Job not found.", 404);
  }

  const status = job.status;

  if (action === "send_proposal") {
    if (!canSendProposalStatus(status)) {
      return jsonError(
        `Cannot send proposal from status "${status}" (expected PENDING_REVIEW).`,
        400,
      );
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "PROPOSAL_SENT" },
    });
    revalidateAdminStructuredJobViews(jobId);
    return NextResponse.json({ ok: true, status: "PROPOSAL_SENT" });
  }

  if (action === "mock_payment_success") {
    if (!canMockPaymentSuccess(status)) {
      return jsonError(
        `Mock payment not allowed from status "${status}".`,
        400,
      );
    }

    const prevLb =
      job.laborBreakdown &&
      typeof job.laborBreakdown === "object" &&
      !Array.isArray(job.laborBreakdown)
        ? ({ ...(job.laborBreakdown as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};

    prevLb.mockPaymentSuccess = {
      at: new Date().toISOString(),
      note: "Admin mock — simulates successful Stripe checkout.session.completed",
      previousStatus: status,
    };

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "CURRENT_JOB",
        laborBreakdown: prevLb as Prisma.InputJsonValue,
      },
    });
    revalidateAdminStructuredJobViews(jobId);
    return NextResponse.json({ ok: true, status: "CURRENT_JOB" });
  }

  if (action === "mark_completed") {
    if (!canMarkCompleted(status)) {
      return jsonError(
        `Cannot mark completed from status "${status}" (expected CURRENT_JOB).`,
        400,
      );
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED" },
    });
    revalidateAdminStructuredJobViews(jobId);
    return NextResponse.json({ ok: true, status: "COMPLETED" });
  }

  return jsonError("Unhandled action.", 500);
}
