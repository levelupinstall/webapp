import { NextResponse } from "next/server";
import { getCarpenterSession } from "@/lib/carpenter-auth";
import { updateCarpenterAvailability } from "@/lib/carpenter-store";

export async function POST(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    availabilityNotes?: string;
    availabilityCalendar?: unknown;
  };
  const availabilityNotes = (body.availabilityNotes || "").trim();
  const user = await updateCarpenterAvailability(
    session.carpenterId,
    availabilityNotes,
    body.availabilityCalendar,
  );
  return NextResponse.json({ user });
}

