import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  createWorkProposalDraftForPortalUser,
  getPortalUserById,
} from "@/lib/client-portal-store";
import {
  defaultProposalTitle,
  generateWorkProposalMarkdown,
} from "@/lib/work-proposal-ai";

export const maxDuration = 120;

const DEFAULT_PAYMENT_CENTS = 15000;
const MAX_TRANSCRIPT = 48_000;
const MAX_RENDERINGS = 6;
const MAX_B64_PER_IMAGE = 750_000;

type Body = {
  transcript?: string;
  renderings?: Array<{ mimeType?: string; dataBase64?: string }>;
};

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const transcript = String(body.transcript ?? "").slice(0, MAX_TRANSCRIPT);
  if (!transcript.trim()) {
    return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
  }

  const portalProfile = await getPortalUserById(session.userId);
  if (!portalProfile) {
    return NextResponse.json({ error: "Portal profile not found." }, { status: 400 });
  }

  const rawR = Array.isArray(body.renderings) ? body.renderings : [];
  const renderingParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];

  for (let i = 0; i < rawR.length && renderingParts.length < MAX_RENDERINGS; i++) {
    const row = rawR[i];
    const b64 = String(row?.dataBase64 ?? "").replace(/\s/g, "");
    if (!b64) continue;
    if (b64.length > MAX_B64_PER_IMAGE) {
      return NextResponse.json(
        { error: `Rendering ${i + 1} is too large. Try fewer or smaller images.` },
        { status: 400 },
      );
    }
    const mime = String(row?.mimeType ?? "image/jpeg").trim() || "image/jpeg";
    renderingParts.push({
      inline_data: { mime_type: mime, data: b64 },
    });
  }

  const clientName = portalProfile.fullName?.trim() || portalProfile.username;
  const markdownBody = await generateWorkProposalMarkdown({
    clientName,
    serviceAddress: portalProfile.serviceAddress,
    transcript,
    renderingParts,
  });

  const renderingsForStore = renderingParts.map((p, idx) => ({
    mimeType: p.inline_data.mime_type,
    dataUrl: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}`,
    caption: `Planner rendering ${idx + 1}`,
  }));

  const proposal = await createWorkProposalDraftForPortalUser({
    portalUserId: session.userId,
    title: defaultProposalTitle(clientName),
    markdownBody,
    paymentAmountCents: DEFAULT_PAYMENT_CENTS,
    renderings: renderingsForStore,
  });

  if (!proposal) {
    return NextResponse.json(
      { error: "Could not create proposal (verify your account is active)." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    proposalId: proposal.id,
    status: proposal.status,
    message:
      "Your proposal draft was created. Level Up will review it and email you when it is ready to sign and pay.",
  });
}
