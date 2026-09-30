import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  adminPatchEstimate,
  appendEstimateAiChat,
  getEstimateById,
} from "@/lib/client-portal-store";
import { reviseEstimateFromInstruction } from "@/lib/planner-estimate";

type Body = {
  portalUserId?: string;
  estimateId?: string;
  message?: string;
};

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const portalUserId = String(body.portalUserId ?? "").trim();
  const estimateId = String(body.estimateId ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (!portalUserId || !estimateId || !message) {
    return NextResponse.json(
      { error: "portalUserId, estimateId, and message required." },
      { status: 400 },
    );
  }

  const existing = await getEstimateById(portalUserId, estimateId);
  if (!existing) return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  if (["approved", "paid"].includes(existing.status)) {
    return NextResponse.json(
      { error: "Estimate is locked (already approved/paid)." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  await appendEstimateAiChat({
    portalUserId,
    estimateId,
    turns: [{ role: "admin", content: message, at: now }],
  });

  const revised = await reviseEstimateFromInstruction({
    estimate: existing,
    instruction: message,
  });

  if ("error" in revised) {
    await appendEstimateAiChat({
      portalUserId,
      estimateId,
      turns: [
        {
          role: "assistant",
          content: `Could not apply AI edits: ${revised.error}`,
          at: new Date().toISOString(),
        },
      ],
    });
    return NextResponse.json({ error: revised.error }, { status: 502 });
  }

  await adminPatchEstimate({
    portalUserId,
    estimateId,
    lineItems: revised.lineItems,
    notes: revised.notes,
  });
  await appendEstimateAiChat({
    portalUserId,
    estimateId,
    turns: [
      { role: "assistant", content: revised.summary, at: new Date().toISOString() },
    ],
  });

  return NextResponse.json({ ok: true, summary: revised.summary });
}
