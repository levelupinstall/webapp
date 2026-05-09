import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { deletePortalUserAccountFully } from "@/lib/client-portal-store";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;
  const id = userId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing portal user id." }, { status: 400 });
  }

  const ok = await deletePortalUserAccountFully(id);
  if (!ok) {
    return NextResponse.json({ error: "Portal account not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
