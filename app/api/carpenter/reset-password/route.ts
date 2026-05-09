import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { finishCarpenterPasswordReset } from "@/lib/carpenter-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; password?: string };
    const token = body.token?.trim() ?? "";
    const password = body.password ?? "";

    if (!token) {
      return NextResponse.json({ error: "Reset link is invalid." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const ok = await finishCarpenterPasswordReset(token, passwordHash);

    if (!ok) {
      return NextResponse.json(
        {
          error:
            "This reset link is invalid or has expired. Use “Forgot password?” on the carpenter login page to request a new email.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reset password." }, { status: 500 });
  }
}
