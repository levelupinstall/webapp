import { NextResponse } from "next/server";
import { getCarpenterSession } from "@/lib/carpenter-auth";
import { getPayoutSummary } from "@/lib/carpenter-store";

export async function GET() {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await getPayoutSummary(session.carpenterId);
  return NextResponse.json({ summary });
}

