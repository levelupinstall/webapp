import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getPortalUserById } from "@/lib/client-portal-store";
import {
  adminAssignJob,
  adminUpdateJob,
  type ClientProfile,
} from "@/lib/carpenter-store";
import { createStructuredJobRow } from "@/lib/structured-job-db";

function portalUserToClientProfile(user: NonNullable<Awaited<ReturnType<typeof getPortalUserById>>>): ClientProfile {
  return {
    name: user.fullName?.trim() || user.username,
    email: user.email,
    phone: user.phone ?? "",
    address: user.serviceAddress || "",
    avatarDataUrl: user.avatarDataUrl || "",
  };
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    carpenterId?: string;
    title?: string;
    designNotes?: string;
    scopeOfWork?: string;
    clientPortalUserId?: string;
    status?: "upcoming" | "active" | "completed";
    estimatedHours?: number;
    materialCostCents?: number | null;
    client?: Partial<ClientProfile>;
    toolsNeeded?: unknown;
    materialsNeeded?: unknown;
    materialsFulfillment?: unknown;
    materialPrepNotes?: string;
    availabilityReview?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const carpenterId = String(body.carpenterId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const designNotes = String(body.designNotes ?? "").trim();
  const scopeOfWork = String(body.scopeOfWork ?? "").trim();

  if (!carpenterId || !title || !scopeOfWork) {
    return NextResponse.json(
      { error: "carpenterId, title, and scopeOfWork are required." },
      { status: 400 },
    );
  }

  let client: ClientProfile;
  const portalId = String(body.clientPortalUserId ?? "").trim();
  if (portalId) {
    const portalUser = await getPortalUserById(portalId);
    if (!portalUser) {
      return NextResponse.json({ error: "Client portal user not found." }, { status: 404 });
    }
    client = portalUserToClientProfile(portalUser);
  } else if (body.client?.name && body.client?.email) {
    client = {
      name: String(body.client.name).trim(),
      email: String(body.client.email).trim(),
      phone: String(body.client.phone ?? "").trim(),
      address: String(body.client.address ?? "").trim(),
      avatarDataUrl: String(body.client.avatarDataUrl ?? "").trim(),
    };
  } else {
    return NextResponse.json(
      { error: "Provide clientPortalUserId or client.name and client.email." },
      { status: 400 },
    );
  }

  const estimatedHours =
    typeof body.estimatedHours === "number" && Number.isFinite(body.estimatedHours)
      ? body.estimatedHours
      : undefined;
  const materialCostCents =
    typeof body.materialCostCents === "number" && Number.isFinite(body.materialCostCents)
      ? Math.round(body.materialCostCents)
      : undefined;

  try {
    const job = await adminAssignJob({
      carpenterId,
      title,
      designNotes: designNotes || "Assigned via CRM.",
      scopeOfWork,
      client,
      clientPortalUserId: portalId || undefined,
      status: body.status,
      estimatedHours,
      materialCostCents,
      toolsNeeded: body.toolsNeeded,
      materialsNeeded: body.materialsNeeded,
      materialsFulfillment: body.materialsFulfillment,
      materialPrepNotes: body.materialPrepNotes,
      availabilityReview: body.availabilityReview,
    });

    if (portalId) {
      const materialDollars =
        materialCostCents != null ? materialCostCents / 100 : 0;
      await createStructuredJobRow({
        id: job.id,
        portalUserId: portalId,
        assignedCarpenterId: carpenterId,
        customerPhone: client.phone.trim(),
        customerEmail: client.email.trim(),
        pricing: {
          materialCost: materialDollars,
          estimatedHours: estimatedHours ?? 0,
          totalLaborHold: 150,
          immediateCharge: 150 + materialDollars,
        },
      });
    }

    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not assign job.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    carpenterId?: string;
    jobId?: string;
    status?: "upcoming" | "active" | "completed";
    estimatedHours?: number | null;
    actualHours?: number | null;
    materialCostCents?: number | null;
    toolsNeeded?: unknown;
    materialsNeeded?: unknown;
    materialsFulfillment?: unknown;
    materialPrepNotes?: string;
    availabilityReview?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const carpenterId = String(body.carpenterId ?? "").trim();
  const jobId = String(body.jobId ?? "").trim();
  if (!carpenterId || !jobId) {
    return NextResponse.json({ error: "carpenterId and jobId are required." }, { status: 400 });
  }

  const patch: Parameters<typeof adminUpdateJob>[0] = { carpenterId, jobId };
  if (body.status !== undefined) patch.status = body.status;
  if (body.estimatedHours !== undefined && body.estimatedHours !== null) {
    if (!Number.isFinite(body.estimatedHours)) {
      return NextResponse.json({ error: "estimatedHours must be a number." }, { status: 400 });
    }
    patch.estimatedHours = body.estimatedHours;
  }
  if (body.actualHours !== undefined && body.actualHours !== null) {
    if (!Number.isFinite(body.actualHours)) {
      return NextResponse.json({ error: "actualHours must be a number." }, { status: 400 });
    }
    patch.actualHours = body.actualHours;
  }
  if (body.materialCostCents !== undefined && body.materialCostCents !== null) {
    if (!Number.isFinite(body.materialCostCents)) {
      return NextResponse.json({ error: "materialCostCents must be a number." }, { status: 400 });
    }
    patch.materialCostCents = Math.round(body.materialCostCents);
  }
  if (body.toolsNeeded !== undefined) patch.toolsNeeded = body.toolsNeeded;
  if (body.materialsNeeded !== undefined) patch.materialsNeeded = body.materialsNeeded;
  if (body.materialsFulfillment !== undefined) patch.materialsFulfillment = body.materialsFulfillment;
  if (body.materialPrepNotes !== undefined) patch.materialPrepNotes = body.materialPrepNotes;
  if (body.availabilityReview !== undefined) patch.availabilityReview = body.availabilityReview;

  try {
    const job = await adminUpdateJob(patch);
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update job.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
