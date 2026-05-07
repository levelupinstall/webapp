import { NextResponse } from "next/server";
import { connectCarpenterGoogleCalendar } from "@/lib/carpenter-store";

type GoogleTokenResponse = {
  refresh_token?: string;
  access_token?: string;
  id_token?: string;
};

function parseEmailFromJwt(token?: string) {
  if (!token) return "";
  const parts = token.split(".");
  if (parts.length < 2) return "";
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      email?: string;
    };
    return payload.email || "";
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = request.headers.get("origin") || `${url.protocol}//${url.host}`;

  if (error) {
    return NextResponse.redirect(`${origin}/carpenter?google=error`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/carpenter?google=missing`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/carpenter?google=not-configured`);
  }

  const redirectUri = `${origin}/api/carpenter/google-calendar/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(`${origin}/carpenter?google=token-failed`);
  }

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  const refreshToken = tokens.refresh_token || "";
  const email = parseEmailFromJwt(tokens.id_token);

  await connectCarpenterGoogleCalendar({
    carpenterId: decodeURIComponent(state),
    email,
    refreshToken,
  });

  return NextResponse.redirect(`${origin}/carpenter?google=connected`);
}

