import { NextRequest, NextResponse } from "next/server";

import { setSessionCookie } from "@/lib/client-portal-auth";
import {
  completePortalSignupVerificationFromMagicLink,
  recordPortalLogin,
} from "@/lib/client-portal-store";
import { verifyPortalSignupVerificationTicket } from "@/lib/portal-verification-ticket";

function redirectHomeWithVerifyStatus(request: NextRequest, status: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("portal_verify", status);
  return NextResponse.redirect(url);
}

function redirectToWelcome(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/portal/welcome";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return redirectHomeWithVerifyStatus(request, "missing");
  }

  const payload = verifyPortalSignupVerificationTicket(token);
  if (!payload) {
    return redirectHomeWithVerifyStatus(request, "invalid");
  }

  const result = await completePortalSignupVerificationFromMagicLink(payload.userId);
  if (!result.ok) {
    return redirectHomeWithVerifyStatus(request, "expired");
  }

  await setSessionCookie({ userId: payload.userId, username: result.username });
  await recordPortalLogin(payload.userId);

  return redirectToWelcome(request);
}
