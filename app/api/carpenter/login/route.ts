import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findCarpenterForLogin } from "@/lib/carpenter-store";
import { setCarpenterSession } from "@/lib/carpenter-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    username?: string;
    password?: string;
  };
  const identifier = (body.email ?? body.username)?.trim() || "";
  const password = body.password || "";
  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const user = await findCarpenterForLogin(identifier);
  if (!user) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });

  await setCarpenterSession({ carpenterId: user.id, username: user.username });
  return NextResponse.json({ success: true });
}

