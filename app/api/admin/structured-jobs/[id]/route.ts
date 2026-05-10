import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { revalidateAdminDashboard } from "@/lib/admin-revalidate";
import { getAdminSession } from "@/lib/admin-auth";
import { recomputeStructuredJobPricing } from "@/lib/admin-structured-job-pricing";
import { adminPatchWorkProposal, getWorkProposalById } from "@/lib/client-portal-store";
import { prisma } from "@/lib/prisma";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _request: Request,
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

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return jsonError("Job not found.", 404);
  }

  let proposal: {
    id: string;
    title: string;
    status: string;
    sentAt?: string | null;
  } | null = null;

  if (job.portalUserId && job.workProposalId) {
    const p = await getWorkProposalById(job.portalUserId, job.workProposalId);
    if (p) {
      proposal = {
        id: p.id,
        title: p.title,
        status: p.status,
        sentAt: p.sentAt ?? null,
      };
    }
  }

  return NextResponse.json({
    job: {
      id: job.id,
      createdAt: job.createdAt.toISOString(),
      status: job.status,
      customerPhone: job.customerPhone,
      customerEmail: job.customerEmail,
      portalUserId: job.portalUserId,
      workProposalId: job.workProposalId,
      width: job.width,
      height: job.height,
      depth: job.depth,
      dwellingType: job.dwellingType,
      floorLevel: job.floorLevel,
      hasElevator: job.hasElevator,
      renderUrl: job.renderUrl,
      blueprintUrl: job.blueprintUrl,
      shoppingList: job.shoppingList,
      materialCost: job.materialCost,
      estimatedHours: job.estimatedHours,
      totalLaborHold: job.totalLaborHold,
      immediateCharge: job.immediateCharge,
      paymentAmountCents: job.paymentAmountCents,
      stripeCheckoutSessionId: job.stripeCheckoutSessionId,
      stripeLaborHoldCheckoutSessionId: job.stripeLaborHoldCheckoutSessionId,
      laborBreakdown: job.laborBreakdown,
      scopeOfWorkTerms: job.scopeOfWorkTerms,
      assignedCarpenterId: job.assignedCarpenterId,
      guestPayToken: job.guestPayToken,
      designCategory: job.designCategory,
      designStyle: job.designStyle,
      scopeNotes: job.scopeNotes,
    },
    proposal,
  });
}

export async function PATCH(
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

  let body: {
    customerEmail?: string;
    customerPhone?: string;
    paymentAmountCents?: number | null;
    materialCost?: number;
    estimatedHours?: number;
    shoppingList?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return jsonError("Job not found.", 404);
  }

  const data: Record<string, unknown> = {};

  if (typeof body.customerEmail === "string") {
    data.customerEmail = body.customerEmail.trim();
  }
  if (typeof body.customerPhone === "string") {
    data.customerPhone = body.customerPhone.trim();
  }
  if (body.paymentAmountCents !== undefined) {
    if (body.paymentAmountCents === null) {
      data.paymentAmountCents = null;
    } else if (
      typeof body.paymentAmountCents === "number" &&
      Number.isFinite(body.paymentAmountCents)
    ) {
      data.paymentAmountCents = Math.round(body.paymentAmountCents);
    } else {
      return jsonError("Invalid paymentAmountCents.", 400);
    }
  }

  let materialCost = job.materialCost;
  let estimatedHours = job.estimatedHours;
  let pricingTouched = false;
  let recomputedPaymentCents: number | null = null;

  if (typeof body.materialCost === "number" && Number.isFinite(body.materialCost)) {
    materialCost = body.materialCost;
    pricingTouched = true;
  }
  if (typeof body.estimatedHours === "number" && Number.isFinite(body.estimatedHours)) {
    estimatedHours = body.estimatedHours;
    pricingTouched = true;
  }

  if (pricingTouched) {
    const next = recomputeStructuredJobPricing({
      materialCostCad: materialCost,
      estimatedTotalHours: estimatedHours,
    });
    data.materialCost = next.materialCost;
    data.estimatedHours = next.estimatedHours;
    data.totalLaborHold = next.totalLaborHold;
    data.immediateCharge = next.immediateCharge;
    data.paymentAmountCents = next.paymentAmountCents;
    recomputedPaymentCents = next.paymentAmountCents;
  }

  if (body.shoppingList !== undefined) {
    if (!Array.isArray(body.shoppingList)) {
      return jsonError("shoppingList must be an array.", 400);
    }
    data.shoppingList = body.shoppingList as Prisma.InputJsonValue;
  }

  const prevBreakdown =
    job.laborBreakdown &&
    typeof job.laborBreakdown === "object" &&
    !Array.isArray(job.laborBreakdown)
      ? ({ ...(job.laborBreakdown as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (pricingTouched || body.shoppingList !== undefined) {
    prevBreakdown.adminRevision = {
      ...(typeof prevBreakdown.adminRevision === "object" &&
      prevBreakdown.adminRevision !== null &&
      !Array.isArray(prevBreakdown.adminRevision)
        ? prevBreakdown.adminRevision
        : {}),
      updatedAt: new Date().toISOString(),
      ...(pricingTouched
        ? {
            materialCostCad: data.materialCost ?? materialCost,
            estimatedHours: data.estimatedHours ?? estimatedHours,
            totalLaborHoldCad: data.totalLaborHold,
            immediateChargeCad: data.immediateCharge,
            paymentAmountCents: data.paymentAmountCents,
          }
        : {}),
    };
    data.laborBreakdown = prevBreakdown as Prisma.InputJsonValue;
  }

  if (Object.keys(data).length === 0) {
    return jsonError("No updates provided.", 400);
  }

  await prisma.job.update({
    where: { id: jobId },
    data: data as Prisma.JobUpdateInput,
  });

  revalidateAdminDashboard();

  if (
    pricingTouched &&
    recomputedPaymentCents !== null &&
    job.portalUserId?.trim() &&
    job.workProposalId?.trim()
  ) {
    await adminPatchWorkProposal({
      portalUserId: job.portalUserId.trim(),
      proposalId: job.workProposalId.trim(),
      paymentAmountCents: recomputedPaymentCents,
    });
  }

  return NextResponse.json({ ok: true });
}
