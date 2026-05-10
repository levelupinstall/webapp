import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { getPortalUserById } from "@/lib/client-portal-store";
import { createStructuredJobRow } from "@/lib/structured-job-db";

export const maxDuration = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public job intake: persists a structured `Job` row with optional portal linkage.
 * Guests must send `customerPhone` + `email`; logged-in portal users may omit fields we can copy from their profile.
 */
export async function POST(request: Request) {
  let body: {
    customerPhone?: string;
    email?: string;
    width?: number;
    height?: number;
    depth?: number;
    dwellingType?: string;
    floorLevel?: number;
    hasElevator?: boolean;
    materialCost?: number;
    estimatedHours?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  let customerPhone = String(body.customerPhone ?? "").trim();
  let customerEmail = String(body.email ?? "").trim();

  const session = await getSessionFromCookie();
  let portalUserId: string | null = null;
  if (session) {
    const portal = await getPortalUserById(session.userId);
    if (portal) {
      portalUserId = portal.id;
      if (!customerEmail && portal.email?.trim()) {
        customerEmail = portal.email.trim();
      }
      if (!customerPhone && portal.phone?.trim()) {
        customerPhone = portal.phone.trim();
      }
    }
  }

  if (!customerPhone) {
    return NextResponse.json({ error: "customerPhone is required." }, { status: 400 });
  }
  if (!customerEmail || !EMAIL_RE.test(customerEmail)) {
    return NextResponse.json(
      {
        error:
          "A valid email is required for receipts and secure payment links. Add one or sign in to your portal.",
      },
      { status: 400 },
    );
  }

  const width =
    typeof body.width === "number" && Number.isFinite(body.width) ? body.width : 0;
  const height =
    typeof body.height === "number" && Number.isFinite(body.height) ? body.height : 0;
  const depth =
    typeof body.depth === "number" && Number.isFinite(body.depth) ? body.depth : 0;
  const dwellingType =
    typeof body.dwellingType === "string" && body.dwellingType.trim()
      ? body.dwellingType.trim()
      : "UNKNOWN";
  const floorLevel =
    typeof body.floorLevel === "number" && Number.isFinite(body.floorLevel)
      ? Math.round(body.floorLevel)
      : 1;
  const hasElevator =
    typeof body.hasElevator === "boolean" ? body.hasElevator : true;

  const materialCost =
    typeof body.materialCost === "number" && Number.isFinite(body.materialCost)
      ? body.materialCost
      : 0;
  const estimatedHours =
    typeof body.estimatedHours === "number" && Number.isFinite(body.estimatedHours)
      ? body.estimatedHours
      : 0;

  try {
    const jobId = await createStructuredJobRow({
      portalUserId,
      assignedCarpenterId: null,
      customerPhone,
      customerEmail,
      spatial: {
        width,
        height,
        depth,
        dwellingType,
        floorLevel,
        hasElevator,
      },
      pricing: {
        materialCost,
        estimatedHours,
        totalLaborHold: 150,
        immediateCharge: 150 + materialCost,
      },
    });

    return NextResponse.json({
      ok: true,
      jobId,
      linkedPortal: Boolean(portalUserId),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not save job request. Try again shortly." },
      { status: 500 },
    );
  }
}
