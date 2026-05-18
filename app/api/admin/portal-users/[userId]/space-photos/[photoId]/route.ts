import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { removePortalUserSpacePhoto } from "@/lib/client-portal-store";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string; photoId: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, photoId } = await context.params;
  const uid = userId?.trim();
  const pid = photoId?.trim();
  if (!uid || !pid) {
    return NextResponse.json({ error: "Missing user or photo id." }, { status: 400 });
  }

  const ok = await removePortalUserSpacePhoto(uid, pid);
  if (!ok) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
