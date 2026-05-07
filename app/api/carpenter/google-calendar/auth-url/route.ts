import { NextResponse } from "next/server";
import { getCarpenterSession } from "@/lib/carpenter-auth";

function getOrigin(request: Request) {
  return request.headers.get("origin") || "http://localhost:3000";
}

export async function GET(request: Request) {
  const session = await getCarpenterSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Google Calendar is not configured yet." },
      { status: 503 },
    );
  }

  const redirectUri = `${getOrigin(request)}/api/carpenter/google-calendar/callback`;
  const state = encodeURIComponent(session.carpenterId);
  const scope = encodeURIComponent("openid email https://www.googleapis.com/auth/calendar");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId,
  )}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${state}`;

  return NextResponse.json({ url: authUrl });
}

