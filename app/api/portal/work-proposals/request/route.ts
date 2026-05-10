import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import {
  createWorkProposalDraftForPortalUser,
  getPortalUserById,
} from "@/lib/client-portal-store";
import { createFormalProposalIntakeJob } from "@/lib/formal-proposal-intake-job";
import {
  defaultProposalTitle,
  extractBudgetHintFromTranscript,
  generateWorkProposalMarkdown,
} from "@/lib/work-proposal-ai";

export const maxDuration = 120;

const DEFAULT_PAYMENT_CENTS = 15000;
const MAX_TRANSCRIPT = 48_000;
const MAX_RENDERINGS = 6;
const MAX_SPACE_PHOTOS = 6;
const MAX_B64_PER_IMAGE = 750_000;

type RawRendering = { mimeType?: string; dataBase64?: string };

async function fileToInlinePart(
  file: File,
): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
  if (!b64 || b64.length > MAX_B64_PER_IMAGE) return null;
  const mime = (file.type || "image/jpeg").trim() || "image/jpeg";
  return { inline_data: { mime_type: mime, data: b64 } };
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const portalProfile = await getPortalUserById(session.userId);
  if (!portalProfile) {
    return NextResponse.json({ error: "Portal profile not found." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") || "";

  let transcript = "";
  let rawRenderings: RawRendering[] = [];
  const spacePhotoParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
    }

    transcript = String(form.get("transcript") ?? "").slice(0, MAX_TRANSCRIPT);
    const rendJson = String(form.get("renderings") ?? "").trim();
    try {
      const parsed = rendJson ? (JSON.parse(rendJson) as unknown) : [];
      rawRenderings = Array.isArray(parsed) ? (parsed as RawRendering[]) : [];
    } catch {
      rawRenderings = [];
    }

    const files = form
      .getAll("spacePhotos")
      .filter((x): x is File => typeof File !== "undefined" && x instanceof File);
    for (const file of files) {
      if (spacePhotoParts.length >= MAX_SPACE_PHOTOS) break;
      const part = await fileToInlinePart(file);
      if (part) spacePhotoParts.push(part);
    }
  } else {
    let body: {
      transcript?: string;
      renderings?: RawRendering[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
    transcript = String(body.transcript ?? "").slice(0, MAX_TRANSCRIPT);
    rawRenderings = Array.isArray(body.renderings) ? body.renderings : [];
  }

  if (!transcript.trim()) {
    return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
  }

  const renderingParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];

  for (let i = 0; i < rawRenderings.length && renderingParts.length < MAX_RENDERINGS; i++) {
    const row = rawRenderings[i];
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

  const budgetHint = extractBudgetHintFromTranscript(transcript);

  const clientName = portalProfile.fullName?.trim() || portalProfile.username;
  const markdownBody = await generateWorkProposalMarkdown({
    clientName,
    serviceAddress: portalProfile.serviceAddress,
    transcript,
    renderingParts,
    spacePhotoParts,
    budgetHint,
  });

  const renderingsForStore = renderingParts.map((p, idx) => ({
    mimeType: p.inline_data.mime_type,
    dataUrl: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}`,
    caption: `Agreed concept rendering ${idx + 1}`,
  }));

  const spacePhotosForStore = spacePhotoParts.map((p, idx) => ({
    mimeType: p.inline_data.mime_type,
    dataUrl: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}`,
    caption: `Customer space photo ${idx + 1}`,
  }));

  const proposal = await createWorkProposalDraftForPortalUser({
    portalUserId: session.userId,
    title: defaultProposalTitle(clientName),
    markdownBody,
    paymentAmountCents: DEFAULT_PAYMENT_CENTS,
    renderings: renderingsForStore,
    ...(spacePhotosForStore.length ? { spacePhotos: spacePhotosForStore } : {}),
    ...(budgetHint ? { budgetNotes: budgetHint } : {}),
  });

  if (!proposal) {
    return NextResponse.json(
      { error: "Could not create proposal (verify your account is active)." },
      { status: 400 },
    );
  }

  const designNotes = [
    "Formal proposal intake — edit the draft under Clients → Formal proposals, then email the customer.",
    "",
    `Portal user ID: ${session.userId}`,
    `Proposal ID: ${proposal.id}`,
    `Default proposal payment placeholder: $${(DEFAULT_PAYMENT_CENTS / 100).toFixed(2)} CAD`,
    "",
    `Customer phone: ${portalProfile.phone?.trim() || "—"}`,
    `Job / service address: ${portalProfile.serviceAddress?.trim() || "—"}`,
    "",
    `Budget cues (from planner): ${budgetHint || "Not clearly stated — confirm with customer."}`,
  ].join("\n");

  try {
    await createFormalProposalIntakeJob({
      portalUserId: session.userId,
      proposalId: proposal.id,
      proposalTitle: `Proposal review — ${clientName}`,
      scopeOfWork: transcript.trim().slice(0, 8000),
      designNotes,
      client: {
        name: clientName,
        email: portalProfile.email,
        phone: portalProfile.phone ?? "",
        address: portalProfile.serviceAddress || "",
        avatarDataUrl: portalProfile.avatarDataUrl || "",
      },
      spacePhotos: proposal.spacePhotos ?? [],
      renderings: proposal.renderings,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create pending intake job in CRM.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    proposalId: proposal.id,
    status: proposal.status,
    message:
      "Your proposal draft was created. Level Up will review it and email you when it is ready to sign and pay.",
  });
}
