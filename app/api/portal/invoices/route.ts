import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { getUserPortalData } from "@/lib/client-portal-store";

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserPortalData(session.userId);
  return NextResponse.json({ invoices: user.invoices });
}

