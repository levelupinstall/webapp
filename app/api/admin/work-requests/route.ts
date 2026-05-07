import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { updateWorkRequestStatus, type WorkRequest } from "@/lib/work-requests-store";

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; status?: WorkRequest["status"] };
  try {
    body = (await request.json()) as { id?: string; status?: WorkRequest["status"] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const status = body.status;
  if (!id || !status) {
    return NextResponse.json({ error: "id and status are required." }, { status: 400 });
  }

  const allowed: WorkRequest["status"][] = ["new", "reviewing", "assigned", "closed"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const updated = await updateWorkRequestStatus(id, status);
    return NextResponse.json({ workRequest: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
