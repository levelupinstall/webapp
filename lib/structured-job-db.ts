import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_LABOR_HOLD_DOLLARS = 150;

function newGuestPayToken(): string {
  return randomBytes(18).toString("base64url");
}

export type CreateStructuredJobParams = {
  /** When set, matches CRM JSON `CarpenterJob.id`. Omit for standalone guest submits (DB generates cuid). */
  id?: string;
  portalUserId?: string | null;
  assignedCarpenterId?: string | null;
  customerPhone: string;
  customerEmail: string;
  workProposalId?: string | null;
  spatial?: Partial<{
    width: number;
    height: number;
    depth: number;
    dwellingType: string;
    floorLevel: number;
    hasElevator: boolean;
  }>;
  pricing?: Partial<{
    materialCost: number;
    estimatedHours: number;
    totalLaborHold: number;
    immediateCharge: number;
  }>;
};

/**
 * Persists a structured `Job` row parallel to CRM intake or as a standalone guest submission.
 * Safe to call twice for the same `id` when provided (ignores unique violations on id).
 */
export async function createStructuredJobRow(params: CreateStructuredJobParams): Promise<string> {
  const materialCost = params.pricing?.materialCost ?? 0;
  const estimatedHours = params.pricing?.estimatedHours ?? 0;
  const totalLaborHold =
    params.pricing?.totalLaborHold ?? DEFAULT_LABOR_HOLD_DOLLARS;
  const immediateCharge =
    params.pricing?.immediateCharge ?? DEFAULT_LABOR_HOLD_DOLLARS + materialCost;

  const guestPayToken = newGuestPayToken();

  try {
    const row = await prisma.job.create({
      data: {
        ...(params.id ? { id: params.id } : {}),
        portalUserId: params.portalUserId ?? null,
        assignedCarpenterId: params.assignedCarpenterId ?? null,
        workProposalId: params.workProposalId?.trim() || null,
        customerPhone: params.customerPhone.trim(),
        customerEmail: params.customerEmail.trim(),
        guestPayToken,
        status: "PENDING_REVIEW",
        width: params.spatial?.width ?? 0,
        height: params.spatial?.height ?? 0,
        depth: params.spatial?.depth ?? 0,
        dwellingType: params.spatial?.dwellingType?.trim() || "UNKNOWN",
        floorLevel: params.spatial?.floorLevel ?? 1,
        hasElevator: params.spatial?.hasElevator ?? true,
        shoppingList: [],
        materialCost,
        estimatedHours,
        totalLaborHold,
        immediateCharge,
      },
    });
    return row.id;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      if (params.id) return params.id;
      throw err;
    }
    throw err;
  }
}
