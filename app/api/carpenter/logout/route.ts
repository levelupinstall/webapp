import { NextResponse } from "next/server";
import { clearCarpenterSession } from "@/lib/carpenter-auth";

export async function POST() {
  await clearCarpenterSession();
  return NextResponse.json({ success: true });
}

