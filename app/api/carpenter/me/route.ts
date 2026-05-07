import { NextResponse } from "next/server";
import { getCarpenterSession } from "@/lib/carpenter-auth";
import { getCarpenterDashboard } from "@/lib/carpenter-store";

export async function GET() {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const user = await getCarpenterDashboard(session.carpenterId);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

