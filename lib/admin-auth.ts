import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const COOKIE_NAME = "levelup_admin_session";

type AdminPayload = {
  role: "admin";
};

function getAdminSecret() {
  return process.env.ADMIN_SECRET || process.env.AUTH_SECRET || "dev-only-admin-secret-change-me";
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || "";
}

export async function setAdminSessionCookie() {
  const token = jwt.sign({ role: "admin" } satisfies AdminPayload, getAdminSecret(), {
    expiresIn: "12h",
  });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAdminSession(): Promise<AdminPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getAdminSecret()) as AdminPayload;
    if (payload.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}
