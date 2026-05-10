import { Prisma } from "@prisma/client";

import {
  geminiEstimateMaterialsShoppingList,
  geminiExtractPlannerVisualSpec,
  geminiExtractPlannerSubmitDesign,
  geminiGenerateInstallBlueprint,
} from "@/lib/gemini-client";
import { createWorkProposalDraftForPortalUser } from "@/lib/client-portal-store";
import { createFormalProposalIntakeJob } from "@/lib/formal-proposal-intake-job";
import {
  extractBudgetHintFromTranscript,
  generateWorkProposalMarkdown,
  defaultProposalTitle,
} from "@/lib/work-proposal-ai";
import { applyFullCarpenterPipeline, type PlannerVisualSpec } from "@/lib/planner-visual-spec";
import { prisma } from "@/lib/prisma";
import type { PlannerSubmitDesignExtract } from "@/lib/planner-submit-design-types";
import {
  CALL_OUT_FEE_CAD,
  applySubmitDimensionSwap,
  computePlannerLaborAndCharges,
  heuristicBaseLaborHours,
} from "@/lib/planner-submit-design-labor";
import {
  createPlannerSubmitStripeSessions,
} from "@/lib/planner-submit-design-stripe";
import { buildPlannerScopeOfWorkTermsMarkdown } from "@/lib/planner-submit-design-scope";
import type { PlannerSubmitParsedMultipart } from "@/lib/planner-submit-parse-request";
import { newGuestPayToken } from "@/lib/structured-job-db";
const MAX_STORED_DATA_URL_CHARS = 350_000;

/** Narrow portal profile shape returned by `getPortalUserById`. */
export type PlannerSubmitPortalProfile = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  serviceAddress: string;
  phone: string;
  avatarDataUrl: string;
};

function truncateDataUrl(dataUrl: string, label: string): string | null {
  if (!dataUrl.startsWith("data:")) return null;
  if (dataUrl.length <= MAX_STORED_DATA_URL_CHARS) return dataUrl;
  console.warn(`[planner-submit] ${label} data URL truncated for DB storage`);
  return `${dataUrl.slice(0, MAX_STORED_DATA_URL_CHARS)}\n…`;
}

function blankExtract(): PlannerSubmitDesignExtract {
  return {
    width: null,
    height: null,
    depth: null,
    material: null,
    style: null,
    floorLevel: null,
    dwellingType: null,
    hasElevator: null,
    baseLaborHoursEstimate: null,
  };
}

function mergeVisualIntoSubmit(
  e: PlannerSubmitDesignExtract,
  vis: PlannerVisualSpec,
): PlannerSubmitDesignExtract {
  const next: PlannerSubmitDesignExtract = { ...e };
  next.width = next.width ?? vis.width;
  next.height = next.height ?? vis.height;
  next.depth = next.depth ?? vis.depth;
  next.material = next.material ?? vis.material;
  next.style = next.style ?? vis.style;
  next.floorLevel = next.floorLevel ?? vis.floor;
  if (!next.dwellingType?.trim() && vis.isCondo === true) {
    next.dwellingType = "Condominium";
  }
  return next;
}

async function resolvePlannerSubmitExtraction(
  transcript: string,
): Promise<PlannerSubmitDesignExtract> {
  let e =
    (await geminiExtractPlannerSubmitDesign(transcript)) ?? blankExtract();

  const visRaw = await geminiExtractPlannerVisualSpec(transcript);
  const vis = visRaw ? applyFullCarpenterPipeline(visRaw, transcript) : null;
  if (vis) {
    e = mergeVisualIntoSubmit(e, vis);
  }

  const low = transcript.toLowerCase();
  if (e.hasElevator === null) {
    if (
      /\bno\s+elevator\b|\bwithout\s+(?:an\s+)?elevator\b|\bstairs\s+only\b|\bwalk[\s-]?up\b|\bfreight\s+elevator\s+only\b/i.test(
        low,
      )
    ) {
      e.hasElevator = false;
    }
  }

  if (e.baseLaborHoursEstimate === null) {
    e.baseLaborHoursEstimate = heuristicBaseLaborHours(transcript);
  }

  return e;
}

function coerceDim(value: number | null, fallback: number): number {
  if (value === null || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(240, Math.max(1, value));
}

export async function executePlannerSubmitDesignPipeline(params: {
  parsed: PlannerSubmitParsedMultipart;
  portalUserId: string;
  portalProfile: PlannerSubmitPortalProfile;
  origin: string;
}): Promise<{
  proposalId: string;
  jobId: string;
  immediateCheckoutUrl: string | null;
  laborHoldCheckoutUrl: string | null;
  stripeConfigured: boolean;
  stripeError?: string;
}> {
  const { transcript, renderingParts, spacePhotoParts } = params.parsed;

  const extraction = await resolvePlannerSubmitExtraction(transcript);

  const w0 = coerceDim(extraction.width, 48);
  const h0 = coerceDim(extraction.height, 84);
  const d0 = coerceDim(extraction.depth, 14);
  const swapped = applySubmitDimensionSwap(w0, h0, d0);

  const floorLevel =
    extraction.floorLevel !== null && Number.isFinite(extraction.floorLevel)
      ? Math.round(extraction.floorLevel)
      : 1;

  const hasElevator =
    extraction.hasElevator === null ? true : extraction.hasElevator;

  const dwellingType =
    extraction.dwellingType?.trim() || "Residential (unspecified)";

  const dimsSummary = `${swapped.width}" W × ${swapped.height}" H × ${swapped.depth}" D`;
  const materialStyleSummary =
    [extraction.material, extraction.style].filter(Boolean).join(" · ") ||
    "As discussed in transcript.";
  const dwellingFloorSummary = `${dwellingType}; finished floor ${floorLevel}; elevator ${
    hasElevator ? "available / assumed" : "not available / walk-up"
  }`;

  const dimsHintForGemini = dimsSummary;

  const materialsPromise = geminiEstimateMaterialsShoppingList({
    transcript,
    dimsSummary: dimsHintForGemini,
    dwellingLabel: dwellingFloorSummary,
  });

  const primaryRendering = renderingParts[0];
  let blueprintUrl: string | null = null;
  let blueprintOk = false;

  const blueprintPromise = primaryRendering
    ? geminiGenerateInstallBlueprint({
        referenceMimeType: primaryRendering.inline_data.mime_type,
        referenceDataBase64: primaryRendering.inline_data.data,
        widthIn: swapped.width,
        heightIn: swapped.height,
        depthIn: swapped.depth,
        materialHint: extraction.material,
        styleHint: extraction.style,
      }).then((bp) => {
        if ("error" in bp) return null;
        const img = bp.images[0];
        if (!img?.dataBase64) return null;
        const url = `data:${img.mimeType};base64,${img.dataBase64}`;
        return truncateDataUrl(url, "blueprint");
      })
    : Promise.resolve(null);

  const [materials, blueprintResolved] = await Promise.all([
    materialsPromise,
    blueprintPromise,
  ]);

  blueprintUrl = blueprintResolved;
  blueprintOk = Boolean(blueprintUrl);

  const labor = computePlannerLaborAndCharges({
    extraction: {
      ...extraction,
      floorLevel,
      hasElevator,
      dwellingType,
    },
    dims: swapped,
    materialCostCad: materials.totalMaterialCad,
  });

  const scopeMarkdown = buildPlannerScopeOfWorkTermsMarkdown({
    dimsSummary,
    materialStyleSummary,
    dwellingFloorSummary,
    labor,
  });

  const budgetHint = extractBudgetHintFromTranscript(transcript);

  const clientName =
    params.portalProfile.fullName?.trim() || params.portalProfile.username;

  let markdownBody = await generateWorkProposalMarkdown({
    clientName,
    serviceAddress: params.portalProfile.serviceAddress,
    transcript,
    renderingParts,
    spacePhotoParts,
    budgetHint,
  });

  markdownBody = `${markdownBody.trim()}\n\n---\n\n${scopeMarkdown}\n`;

  const immediateCents = Math.max(100, Math.round(labor.immediateChargeCad * 100));
  const laborHoldCents = Math.round(labor.laborHoldCad * 100);

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
    portalUserId: params.portalUserId,
    title: defaultProposalTitle(clientName),
    markdownBody,
    paymentAmountCents: immediateCents,
    renderings: renderingsForStore,
    ...(spacePhotosForStore.length ? { spacePhotos: spacePhotosForStore } : {}),
    ...(budgetHint ? { budgetNotes: budgetHint } : {}),
  });

  if (!proposal) {
    throw new Error("Could not create proposal draft.");
  }

  const primaryRenderUrl = renderingsForStore[0]?.dataUrl
    ? truncateDataUrl(renderingsForStore[0].dataUrl, "render")
    : null;

  const shoppingListJson = materials.items.map((it) => ({
    description: it.description,
    estimatedCad: it.estimatedCad,
    qty: it.qty ?? null,
    notes: it.notes ?? null,
  }));

  const laborBreakdownBase: Prisma.JsonObject = {
    extraction: {
      width: extraction.width,
      height: extraction.height,
      depth: extraction.depth,
      material: extraction.material,
      style: extraction.style,
      floorLevel,
      dwellingType,
      hasElevator,
      baseLaborHoursEstimate: extraction.baseLaborHoursEstimate,
    },
    dimsAppliedInches: swapped,
    labor: {
      baseLaborHours: labor.baseLaborHours,
      floorAccessBufferHours: labor.floorAccessBufferHours,
      condoBufferHours: labor.condoBufferHours,
      hoursBeforeMargin: labor.hoursBeforeMargin,
      carpentryMarginMultiplier: labor.carpentryMarginMultiplier,
      estimatedTotalHours: labor.estimatedTotalHours,
      laborHoldHours: labor.laborHoldHours,
      laborHoldCad: labor.laborHoldCad,
    },
    charges: {
      callOutFeeCad: CALL_OUT_FEE_CAD,
      materialCostCad: labor.materialCostCad,
      immediateChargeCad: labor.immediateChargeCad,
    },
    materials: {
      grounded: materials.grounded,
      totalMaterialCad: materials.totalMaterialCad,
    },
    blueprintGenerated: blueprintOk,
  };

  const designNotes = [
    "Planner submit pipeline — structured Job row + Stripe checkouts.",
    "",
    `Portal user ID: ${params.portalUserId}`,
    `Proposal ID: ${proposal.id}`,
    `Immediate checkout target (CAD): $${labor.immediateChargeCad.toFixed(2)} (${immediateCents}¢)`,
    `Labor hold (CAD): $${labor.laborHoldCad.toFixed(2)} (${laborHoldCents}¢ manual capture when applicable)`,
    "",
    `Materials estimate grounded via Search: ${materials.grounded ? "yes" : "no"}`,
    `Blueprint generated: ${blueprintOk ? "yes" : "no"}`,
    "",
    `Customer phone: ${params.portalProfile.phone?.trim() || "—"}`,
    `Job / service address: ${params.portalProfile.serviceAddress?.trim() || "—"}`,
  ].join("\n");

  const scopeOfWorkBlock = [
    "### Structured extraction summary",
    `- ${dimsSummary}`,
    `- ${materialStyleSummary}`,
    `- ${dwellingFloorSummary}`,
    "",
    "### Homeowner transcript",
    transcript.trim().slice(0, 7500),
  ].join("\n");

  const { carpenterId, jobId } = await createFormalProposalIntakeJob({
    portalUserId: params.portalUserId,
    proposalId: proposal.id,
    proposalTitle: `Proposal review — ${clientName}`,
    scopeOfWork: scopeOfWorkBlock,
    designNotes,
    client: {
      name: clientName,
      email: params.portalProfile.email,
      phone: params.portalProfile.phone ?? "",
      address: params.portalProfile.serviceAddress || "",
      avatarDataUrl: params.portalProfile.avatarDataUrl || "",
    },
    spacePhotos: proposal.spacePhotos ?? [],
    renderings: proposal.renderings,
    skipStructuredJobRow: true,
  });

  await prisma.job.create({
    data: {
      id: jobId,
      portalUserId: params.portalUserId,
      assignedCarpenterId: carpenterId,
      workProposalId: proposal.id,
      customerPhone: params.portalProfile.phone?.trim() ?? "",
      customerEmail: params.portalProfile.email.trim(),
      guestPayToken: newGuestPayToken(),
      status: "PENDING_REVIEW",

      width: swapped.width,
      height: swapped.height,
      depth: swapped.depth,
      dwellingType,
      floorLevel,
      hasElevator,

      renderUrl: primaryRenderUrl,
      blueprintUrl,
      shoppingList: shoppingListJson as unknown as Prisma.InputJsonValue,

      materialCost: labor.materialCostCad,
      estimatedHours: labor.estimatedTotalHours,
      totalLaborHold: labor.laborHoldCad,
      immediateCharge: labor.immediateChargeCad,
      paymentAmountCents: immediateCents,

      laborBreakdown: laborBreakdownBase,
      scopeOfWorkTerms: scopeMarkdown,
    },
  });

  let immediateCheckoutUrl: string | null = null;
  let laborHoldCheckoutUrl: string | null = null;
  let stripeError: string | undefined;

  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

  if (!stripeConfigured) {
    stripeError = "Stripe is not configured.";
  } else {
    try {
      const sessions = await createPlannerSubmitStripeSessions({
        origin: params.origin.replace(/\/$/, ""),
        jobId,
        proposalId: proposal.id,
        portalUserId: params.portalUserId,
        customerEmail: params.portalProfile.email.trim(),
        immediateAmountCents: immediateCents,
        laborHoldAmountCents: laborHoldCents,
      });

      if (!sessions) {
        stripeError = "Stripe client unavailable.";
      } else {
        immediateCheckoutUrl = sessions.immediateCheckoutUrl;
        laborHoldCheckoutUrl = sessions.laborHoldCheckoutUrl;

        const laborBreakdownFinal: Prisma.JsonObject = {
          ...laborBreakdownBase,
          stripe: {
            immediateSessionId: sessions.immediateSessionId,
            laborHoldSessionId: sessions.laborHoldSessionId,
            immediateAmountCents: immediateCents,
            laborHoldAmountCents: laborHoldCents,
            laborHoldSkippedReason: sessions.laborHoldSkippedReason ?? null,
          },
        };

        await prisma.job.update({
          where: { id: jobId },
          data: {
            stripeCheckoutSessionId: sessions.immediateSessionId,
            stripeLaborHoldCheckoutSessionId: sessions.laborHoldSessionId,
            laborBreakdown: laborBreakdownFinal as Prisma.InputJsonValue,
          },
        });
      }
    } catch (e) {
      stripeError =
        e instanceof Error ? e.message : "Stripe checkout creation failed.";
    }
  }

  return {
    proposalId: proposal.id,
    jobId,
    immediateCheckoutUrl,
    laborHoldCheckoutUrl,
    stripeConfigured,
    ...(stripeError ? { stripeError } : {}),
  };
}
