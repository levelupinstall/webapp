import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { setEstimateSiteMeasurements } from "@/lib/client-portal-store";

type Body = {
  portalUserId?: string;
  estimateId?: string;
  wallWidthIn?: number;
  wallHeightIn?: number;
  ceilingHeightIn?: number;
  notes?: string;
};

/** Tom records the real wall measurements from the site visit (inches). */
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
  if (!portalUserId || !estimateId) {
    return NextResponse.json({ error: "portalUserId and estimateId required." }, { status: 400 });
  }

  try {
    const estimate = await setEstimateSiteMeasurements({
      portalUserId,
      estimateId,
      wallWidthIn: Number(body.wallWidthIn ?? 0),
      wallHeightIn: Number(body.wallHeightIn ?? 0),
      ceilingHeightIn: Number(body.ceilingHeightIn ?? 0),
      notes: String(body.notes ?? ""),
    });
    return NextResponse.json({ ok: true, siteMeasurements: estimate.siteMeasurements });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save measurements." },
      { status: 400 },
    );
  }
}
