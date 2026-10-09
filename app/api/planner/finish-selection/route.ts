import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  appendProposalRendering,
  saveProposalFinishSelection,
} from "@/lib/client-portal-store";
import {
  describeFinishSelection,
  type CustomerFinishSelection,
} from "@/lib/finish-hardware-catalog";
import { geminiRerenderConceptInFinish } from "@/lib/gemini-client";

/**
 * Save the customer's finish/hardware selections to their work proposal.
 * Called from the /planner/finishes configurator after concept approval.
 * After saving, kicks off a background re-render of the concept in the
 * chosen finish (non-blocking — the customer sees it on their proposal).
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

  const finishSelection: CustomerFinishSelection = {
    finishType: selection.finishType,
    ...(selection.paintColorId ? { paintColorId: selection.paintColorId } : {}),
    ...(selection.stainColorId ? { stainColorId: selection.stainColorId } : {}),
    sheen: selection.sheen,
    ...(selection.pullId ? { pullId: selection.pullId } : {}),
    ...(selection.knobId ? { knobId: selection.knobId } : {}),
    ...(selection.drawerSlideId ? { drawerSlideId: selection.drawerSlideId } : {}),
    ...(selection.hingeId ? { hingeId: selection.hingeId } : {}),
  };

  const updated = await saveProposalFinishSelection({
    portalUserId: session.userId,
    proposalId,
    finishSelection,
  });

  if (!updated) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  // Background: re-render the concept in the chosen finish. Non-blocking.
  const conceptRendering = updated.renderings.find(
    (r) => !r.caption?.toLowerCase().includes("shop drawing"),
  );
  if (conceptRendering) {
    const dataMatch = conceptRendering.dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (dataMatch) {
      const finishDesc = describeFinishSelection(finishSelection);
      // Fire and forget — the re-rendered image is added to the proposal
      // when it completes; the customer sees it on their proposal page.
      geminiRerenderConceptInFinish({
        conceptImageMimeType: dataMatch[1],
        conceptImageDataBase64: dataMatch[2],
        finishDescription: finishDesc,
      })
        .then(async (rerendered) => {
          if (!rerendered) return;
          await appendProposalRendering({
            portalUserId: session.userId,
            proposalId,
            mimeType: rerendered.mimeType,
            dataUrl: `data:${rerendered.mimeType};base64,${rerendered.dataBase64}`,
            caption: `Concept in ${finishDesc}`,
          });
        })
        .catch((e) => console.warn("[finish-selection] re-render failed:", e));
    }
  }

  return NextResponse.json({ ok: true, rerenderStarted: !!conceptRendering });
}
