import { prisma } from "@/lib/prisma";
import {
  adminAssignJob,
  type ClientProfile,
} from "@/lib/carpenter-store";
import type { WorkProposalRendering } from "@/lib/client-portal-store";
import { createStructuredJobRow } from "@/lib/structured-job-db";

function mediaRowsFromProposalAssets(params: {
  spacePhotos: WorkProposalRendering[];
  renderings: WorkProposalRendering[];
}): Array<{
  type: "image";
  url: string;
  caption: string;
  phase: "before" | "general";
}> {
  const rows: Array<{
    type: "image";
    url: string;
    caption: string;
    phase: "before" | "general";
  }> = [];
  for (let i = 0; i < params.spacePhotos.length; i++) {
    const p = params.spacePhotos[i];
    if (!p.dataUrl.startsWith("data:")) continue;
    rows.push({
      type: "image",
      url: p.dataUrl,
      caption: p.caption?.trim() || `Customer space photo ${i + 1}`,
      phase: "before",
    });
  }
  for (let i = 0; i < params.renderings.length; i++) {
    const p = params.renderings[i];
    if (!p.dataUrl.startsWith("data:")) continue;
    rows.push({
      type: "image",
      url: p.dataUrl,
      caption: p.caption?.trim() || `Agreed concept rendering ${i + 1}`,
      phase: "general",
    });
  }
  return rows.slice(0, 12);
}

function pickIntakeCarpenterId(): string | null {
  const fromEnv = process.env.CRM_FORMAL_PROPOSAL_INTAKE_CARPENTER_ID?.trim();
  if (fromEnv) return fromEnv;
  return null;
}

/**
 * Creates an **upcoming** CRM job so admins see proposal intake alongside scheduling.
 * Uses `CRM_FORMAL_PROPOSAL_INTAKE_CARPENTER_ID` when set; otherwise assigns to the first carpenter account.
 */
export async function createFormalProposalIntakeJob(params: {
  portalUserId: string;
  proposalId: string;
  proposalTitle: string;
  scopeOfWork: string;
  designNotes: string;
  client: ClientProfile;
  spacePhotos: WorkProposalRendering[];
  renderings: WorkProposalRendering[];
  /** When true, skip `createStructuredJobRow` — caller persists full Prisma Job (planner submit pipeline). */
  skipStructuredJobRow?: boolean;
}): Promise<{ carpenterId: string; jobId: string }> {
  let carpenterId = pickIntakeCarpenterId();
  if (!carpenterId) {
    const row = await prisma.carpenterAccount.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    carpenterId = row?.id ?? null;
  }
  if (!carpenterId) {
    throw new Error(
      "No carpenter account available for proposal intake. Create at least one carpenter account first.",
    );
  }

  const initialMedia = mediaRowsFromProposalAssets({
    spacePhotos: params.spacePhotos,
    renderings: params.renderings,
  });

  const job = await adminAssignJob({
    carpenterId,
    title: params.proposalTitle.trim().slice(0, 200) || "Formal proposal review",
    designNotes: params.designNotes,
    scopeOfWork: params.scopeOfWork,
    client: params.client,
    clientPortalUserId: params.portalUserId,
    status: "upcoming",
    availabilityReview: "pending",
    formalProposalIntake: {
      portalUserId: params.portalUserId,
      proposalId: params.proposalId,
    },
    initialMedia,
  });

  if (!params.skipStructuredJobRow) {
    await createStructuredJobRow({
      id: job.id,
      portalUserId: params.portalUserId,
      assignedCarpenterId: carpenterId,
      customerPhone: params.client.phone?.trim() ?? "",
      customerEmail: params.client.email?.trim() ?? "",
      workProposalId: params.proposalId,
    });
  }

  return { carpenterId, jobId: job.id };
}
