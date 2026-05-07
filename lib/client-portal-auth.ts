import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const COOKIE_NAME = "levelup_portal_session";

type SessionPayload = {
  userId: string;
  username: string;
};

function getAuthSecret() {
  return process.env.AUTH_SECRET || "dev-only-secret-change-me";
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = jwt.sign(payload, getAuthSecret(), { expiresIn: "7d" });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    return jwt.verify(token, getAuthSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

