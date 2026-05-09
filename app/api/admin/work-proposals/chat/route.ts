import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  adminPatchWorkProposal,
  appendWorkProposalAiChat,
  getWorkProposalById,
} from "@/lib/client-portal-store";

type Body = {
  portalUserId?: string;
  proposalId?: string;
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
  const proposalId = String(body.proposalId ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (!portalUserId || !proposalId || !message) {
    return NextResponse.json({ error: "portalUserId, proposalId, and message required." }, { status: 400 });
  }

  const existing = await getWorkProposalById(portalUserId, proposalId);
  if (!existing) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  const now = new Date().toISOString();
  await appendWorkProposalAiChat({
    portalUserId,
    proposalId,
    turns: [{ role: "admin", content: message, at: now }],
  });

  const { reviseWorkProposalMarkdown } = await import("@/lib/work-proposal-ai");
  const revised = await reviseWorkProposalMarkdown({
    currentMarkdown: existing.markdownBody,
    instruction: message,
  });

  if ("error" in revised) {
    await appendWorkProposalAiChat({
      portalUserId,
      proposalId,
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

  const updated = await adminPatchWorkProposal({
    portalUserId,
    proposalId,
    markdownBody: revised.markdown,
  });

  await appendWorkProposalAiChat({
    portalUserId,
    proposalId,
    turns: [
      {
        role: "assistant",
        content: "Proposal updated from your instructions (review the document body).",
        at: new Date().toISOString(),
      },
    ],
  });

  return NextResponse.json({ proposal: updated });
}
