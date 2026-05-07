import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const COOKIE_NAME = "levelup_carpenter_session";

type CarpenterSession = {
  carpenterId: string;
  username: string;
};

function getSecret() {
  return process.env.AUTH_SECRET || "dev-only-secret-change-me";
}

export async function setCarpenterSession(payload: CarpenterSession) {
  const token = jwt.sign(payload, getSecret(), { expiresIn: "7d" });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearCarpenterSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCarpenterSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret()) as CarpenterSession;
  } catch {
    return null;
  }
}

