import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { shopPacketToSvg } from "@/lib/shop-packet";

/** Render the shop-packet elevation SVG server-side (admin preview). */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { packet?: unknown };
  try {
    body = (await request.json()) as { packet?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.packet || typeof body.packet !== "object") {
    return NextResponse.json({ error: "packet required." }, { status: 400 });
  }

  try {
    const svg = shopPacketToSvg(body.packet as Parameters<typeof shopPacketToSvg>[0]);
    return NextResponse.json({ svg });
  } catch {
    return NextResponse.json({ error: "Could not render drawing." }, { status: 400 });
  }
}
