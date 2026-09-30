import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { adminPatchEstimate } from "@/lib/client-portal-store";

type Body = {
  portalUserId?: string;
  estimateId?: string;
  crewSize?: number;
};

/** Tom overrides the AI crew-size recommendation (1 = solo, 2 = two-person). */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const portalUserId = String(body.portalUserId ?? "").trim();
  const estimateId = String(body.estimateId ?? "").trim();
  const crewSize = body.crewSize === 2 ? 2 : body.crewSize === 1 ? 1 : null;
  if (!portalUserId || !estimateId || !crewSize) {
    return NextResponse.json(
      { error: "portalUserId, estimateId and crewSize (1 or 2) required." },
      { status: 400 },
    );
  }

  const updated = await adminPatchEstimate({
    portalUserId,
    estimateId,
    crewSize,
    crewReason: "Set by Tom in the CRM.",
  });
  return NextResponse.json({ ok: true, crewSize: updated.crewSize });
}
