import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { adminPatchWorkProposal } from "@/lib/client-portal-store";

type Body = {
  portalUserId?: string;
  proposalId?: string;
  title?: string;
  markdownBody?: string;
  paymentAmountCents?: number;
};

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const portalUserId = String(body.portalUserId ?? "").trim();
  const proposalId = String(body.proposalId ?? "").trim();
  if (!portalUserId || !proposalId) {
    return NextResponse.json({ error: "portalUserId and proposalId required." }, { status: 400 });
  }

  const proposal = await adminPatchWorkProposal({
    portalUserId,
    proposalId,
    title: body.title,
    markdownBody: body.markdownBody,
    paymentAmountCents: body.paymentAmountCents,
  });

  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  return NextResponse.json({ proposal });
}
