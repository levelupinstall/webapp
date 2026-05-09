import { NextResponse } from "next/server";
import {
  findPortalUserAndProposalByViewToken,
  markWorkProposalViewed,
} from "@/lib/client-portal-store";
import { getWorkProposalTermsMarkdown } from "@/lib/work-proposal-terms";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const found = await findPortalUserAndProposalByViewToken(token);
  if (!found) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  let { proposal } = found;
  if (proposal.status === "draft") {
    return NextResponse.json({ error: "This proposal is not available yet." }, { status: 403 });
  }

  if (proposal.status === "sent") {
    await markWorkProposalViewed({
      portalUserId: found.portalUserId,
      proposalId: proposal.id,
    });
    proposal = {
      ...proposal,
      status: "viewed",
      viewedAt: proposal.viewedAt ?? new Date().toISOString(),
    };
  }

  return NextResponse.json({
    title: proposal.title,
    markdownBody: proposal.markdownBody,
    termsMarkdown: getWorkProposalTermsMarkdown(),
    status: proposal.status,
    paymentAmountCents: proposal.paymentAmountCents,
    renderings: proposal.renderings.map((r) => ({
      id: r.id,
      dataUrl: r.dataUrl,
      caption: r.caption,
    })),
  });
}
