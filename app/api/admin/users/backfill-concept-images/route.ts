import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { backfillConceptImages } from "@/lib/client-portal-store";

type Body = {
  portalUserId?: string;
  images?: Array<{ mimeType?: string; dataBase64?: string }>;
};

/**
 * TEMPORARY admin utility for E2E seeding: attach CRM concept images to a
 * portal user's newest planner activity turn. Remove after the E2E backfill.
 */
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
  const images = (body.images ?? [])
    .filter((x) => x && typeof x.dataBase64 === "string" && x.dataBase64.length > 64)
    .slice(0, 3)
    .map((x) => ({
      mimeType: (x.mimeType || "image/jpeg").trim() || "image/jpeg",
      dataUrl: `data:${(x.mimeType || "image/jpeg").trim() || "image/jpeg"};base64,${(x.dataBase64 as string).trim()}`,
    }));
  if (!portalUserId || !images.length) {
    return NextResponse.json(
      { error: "portalUserId and at least one image (dataBase64) required." },
      { status: 400 },
    );
  }

  const ok = await backfillConceptImages(portalUserId, images);
  if (!ok) return NextResponse.json({ error: "Backfill failed." }, { status: 400 });
  return NextResponse.json({ ok: true, images: images.length });
}
