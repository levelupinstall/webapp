import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { saveProposalFinishSelection } from "@/lib/client-portal-store";
import type { CustomerFinishSelection } from "@/lib/finish-hardware-catalog";

/**
 * Save the customer's finish/hardware selections to their work proposal.
 * Called from the /planner/finishes configurator after concept approval.
 */
export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Sign in to save finish selections." }, { status: 401 });
  }

  let body: { proposalId?: string; selection?: CustomerFinishSelection };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const proposalId = body.proposalId?.trim();
  const selection = body.selection;
  if (!proposalId || !selection || !selection.finishType || !selection.sheen) {
    return NextResponse.json({ error: "Missing proposal or finish selection." }, { status: 400 });
  }

  const updated = await saveProposalFinishSelection({
    portalUserId: session.userId,
    proposalId,
    finishSelection: {
      finishType: selection.finishType,
      ...(selection.paintColorId ? { paintColorId: selection.paintColorId } : {}),
      ...(selection.stainColorId ? { stainColorId: selection.stainColorId } : {}),
      sheen: selection.sheen,
      ...(selection.pullId ? { pullId: selection.pullId } : {}),
      ...(selection.knobId ? { knobId: selection.knobId } : {}),
      ...(selection.drawerSlideId ? { drawerSlideId: selection.drawerSlideId } : {}),
      ...(selection.hingeId ? { hingeId: selection.hingeId } : {}),
    },
  });

  if (!updated) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
