import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/client-portal-auth";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}

