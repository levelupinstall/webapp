import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { setCustomerAssignedCarpenter } from "@/lib/client-portal-store";

/**
 * POST /api/admin/portal-users/assign-carpenter
 * Body: { portalUserId: string, carpenterId: string | null }
 * Sets the customer's default carpenter (carpenter account id, or null for Tom).
 * Draft/sent estimates are updated to match.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { portalUserId?: string; carpenterId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const portalUserId = body.portalUserId?.trim();
  if (!portalUserId) {
    return NextResponse.json({ error: "portalUserId is required" }, { status: 400 });
  }
  const raw = body.carpenterId;
  const carpenterId =
    typeof raw === "string" && raw.trim() ? raw.trim() : null;
  const ok = await setCustomerAssignedCarpenter(portalUserId, carpenterId);
  if (!ok) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, portalUserId, carpenterId });
}
