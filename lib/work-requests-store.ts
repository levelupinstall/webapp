import type { AdminWorkRequest } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type WorkRequestJobPlan = {
  materials: string[];
  tools: string[];
  crewSize: number;
  notes: string;
  generatedAt: string;
};

export type WorkRequest = {
  id: string;
  createdAt: string;
  status: "new" | "reviewing" | "assigned" | "closed";
  source: "booking";
  fullName: string;
  email: string;
  phone: string;
  projectAddress: string;
  preferredDate: string;
  projectDetails: string;
  signatureName: string;
  stripeSessionId: string;
  paidAmountCents: number;
  portalUserId: string;
  jobPlan?: WorkRequestJobPlan;
};

function rowToWorkRequest(row: AdminWorkRequest): WorkRequest {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    status: row.status as WorkRequest["status"],
    source: row.source as WorkRequest["source"],
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    projectAddress: row.projectAddress,
    preferredDate: row.preferredDate,
    projectDetails: row.projectDetails,
    signatureName: row.signatureName,
    stripeSessionId: row.stripeSessionId,
    paidAmountCents: row.paidAmountCents,
    portalUserId: row.portalUserId,
    jobPlan: row.jobPlan
      ? (row.jobPlan as unknown as WorkRequestJobPlan)
      : undefined,
  };
}

export async function upsertWorkRequestFromPaidBooking(params: {
  stripeSessionId: string;
  paidAmountCents: number;
  fullName: string;
  email: string;
  phone: string;
  projectAddress: string;
  preferredDate: string;
  projectDetails: string;
  signatureName: string;
  portalUserId: string;
}) {
  const existing = await prisma.adminWorkRequest.findUnique({
    where: { stripeSessionId: params.stripeSessionId },
  });

  if (existing) {
    const updated = await prisma.adminWorkRequest.update({
      where: { stripeSessionId: params.stripeSessionId },
      data: {
        paidAmountCents: params.paidAmountCents,
        fullName: params.fullName,
        email: params.email,
        phone: params.phone,
        projectAddress: params.projectAddress,
        preferredDate: params.preferredDate,
        projectDetails: params.projectDetails,
        signatureName: params.signatureName,
        portalUserId: params.portalUserId,
      },
    });
    return rowToWorkRequest(updated);
  }

  const created = await prisma.adminWorkRequest.create({
    data: {
      status: "new",
      source: "booking",
      fullName: params.fullName,
      email: params.email,
      phone: params.phone,
      projectAddress: params.projectAddress,
      preferredDate: params.preferredDate,
      projectDetails: params.projectDetails,
      signatureName: params.signatureName,
      stripeSessionId: params.stripeSessionId,
      paidAmountCents: params.paidAmountCents,
      portalUserId: params.portalUserId,
    },
  });
  return rowToWorkRequest(created);
}

export async function listWorkRequestsForAdmin(): Promise<WorkRequest[]> {
  const rows = await prisma.adminWorkRequest.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToWorkRequest);
}

export async function getWorkRequestById(id: string): Promise<WorkRequest | null> {
  const row = await prisma.adminWorkRequest.findUnique({ where: { id } });
  return row ? rowToWorkRequest(row) : null;
}

export async function updateWorkRequestJobPlan(id: string, plan: WorkRequestJobPlan) {
  const exists = await prisma.adminWorkRequest.findUnique({ where: { id } });
  if (!exists) throw new Error("Work request not found.");
  const updated = await prisma.adminWorkRequest.update({
    where: { id },
    data: { jobPlan: plan as unknown as Prisma.InputJsonValue },
  });
  return rowToWorkRequest(updated);
}

export async function updateWorkRequestStatus(id: string, status: WorkRequest["status"]) {
  const exists = await prisma.adminWorkRequest.findUnique({ where: { id } });
  if (!exists) throw new Error("Work request not found.");
  const updated = await prisma.adminWorkRequest.update({
    where: { id },
    data: { status },
  });
  return rowToWorkRequest(updated);
}
