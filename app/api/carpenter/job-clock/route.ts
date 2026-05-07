import { NextResponse } from "next/server";
import { clockJobIn, clockJobOut } from "@/lib/carpenter-store";
import { getCarpenterSession } from "@/lib/carpenter-auth";

export async function POST(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    jobId?: string;
    action?: "in" | "out";
    lat?: number;
    lng?: number;
    accuracyM?: number;
  };

  const jobId = body.jobId?.trim() || "";
  if (!jobId) return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
  if (body.action !== "in" && body.action !== "out") {
    return NextResponse.json({ error: "action must be in or out." }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Coordinates are out of range." }, { status: 400 });
  }

  const geo = {
    lat,
    lng,
    accuracyM:
      body.accuracyM != null && Number.isFinite(body.accuracyM) ? Math.max(0, body.accuracyM) : undefined,
  };

  try {
    const job =
      body.action === "in"
        ? await clockJobIn(session.carpenterId, jobId, geo)
        : await clockJobOut(session.carpenterId, jobId, geo);
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update clock.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
