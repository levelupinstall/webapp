import { NextResponse } from "next/server";
import {
  findPortalUserAndProposalByViewToken,
  recordWorkProposalAcceptance,
} from "@/lib/client-portal-store";

type Body = {
  token?: string;
  signerName?: string;
  agreedTerms?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const signerName = String(body.signerName ?? "").trim();
  const agreedTerms = Boolean(body.agreedTerms);

  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });
  if (!signerName || signerName.length < 2) {
    return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
  }
  if (!agreedTerms) {
    return NextResponse.json({ error: "Accept the terms to continue." }, { status: 400 });
  }

  const found = await findPortalUserAndProposalByViewToken(token);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { proposal } = found;
  if (proposal.status === "draft") {
    return NextResponse.json({ error: "Not available." }, { status: 403 });
  }
  if (proposal.status === "paid") {
    return NextResponse.json({ error: "Already paid." }, { status: 400 });
  }
  if (proposal.status === "accepted_pending_payment") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  if (proposal.status !== "sent" && proposal.status !== "viewed") {
    return NextResponse.json({ error: "Cannot accept this proposal in its current state." }, { status: 400 });
  }

  await recordWorkProposalAcceptance({
    portalUserId: found.portalUserId,
    proposalId: proposal.id,
    signerName,
  });

  return NextResponse.json({ ok: true });
}
