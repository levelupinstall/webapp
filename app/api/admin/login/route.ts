import { NextResponse } from "next/server";
import { getAdminPassword, getMuseAdminPassword, setAdminSessionCookie } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const configured = [getAdminPassword(), getMuseAdminPassword()].filter((p) => p.length > 0);
  if (configured.length === 0) {
    return NextResponse.json(
      { error: "Admin access is not configured. Set ADMIN_PASSWORD in your environment." },
      { status: 503 },
    );
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const password = String(body.password ?? "");
  if (!configured.includes(password)) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  await setAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
