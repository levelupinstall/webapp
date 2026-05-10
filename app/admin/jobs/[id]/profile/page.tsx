import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminJobShoppingTable } from "@/app/admin/jobs/[id]/profile/admin-job-shopping-table";
import { JobProfileStatusPanel } from "@/app/admin/jobs/[id]/profile/job-profile-status-panel";
import { SubmitProposalToClientButton } from "@/app/admin/jobs/[id]/profile/submit-proposal-to-client-button";
import { getAdminSession } from "@/lib/admin-auth";
import {
  classifyDwellingForAdmin,
  normalizeShoppingListForDisplay,
  parseLaborBreakdownForDisplay,
} from "@/lib/admin-job-profile-display";
import { CALL_OUT_FEE_CAD } from "@/lib/planner-submit-design-labor";
import { prisma } from "@/lib/prisma";

function cad(n: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

function statusBadgeClasses(status: string): string {
  const s = status.toUpperCase();
  if (s === "PENDING_REVIEW") return "border-amber-700 bg-amber-950/70 text-amber-100";
  if (s === "PROPOSAL_SENT") return "border-violet-700 bg-violet-950/60 text-violet-100";
  if (s === "CURRENT_JOB") return "border-emerald-700 bg-emerald-950/50 text-emerald-100";
  if (s === "APPROVED_PENDING_PAYMENT") return "border-sky-700 bg-sky-950/60 text-sky-100";
  if (s === "PAID") return "border-emerald-700 bg-emerald-950/60 text-emerald-100";
  if (s === "COMPLETED") return "border-slate-600 bg-slate-900/70 text-slate-200";
  return "border-zinc-600 bg-zinc-800 text-zinc-200";
}

function VisualPane({
  title,
  subtitle,
  src,
  alt,
}: {
  title: string;
  subtitle?: string;
  src: string | null | undefined;
  alt: string;
}) {
  const ok = Boolean(src?.startsWith("data:"));
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="border-b border-zinc-800/80 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</p>
        {subtitle ? <p className="mt-1 text-[11px] leading-snug text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-lg bg-black/50">
        {ok ? (
          // eslint-disable-next-line @next/next/no-img-element -- Prisma data URLs
          <img src={src!} alt={alt} className="max-h-[min(480px,65vh)] w-full object-contain" />
        ) : (
          <p className="px-4 text-center text-sm text-zinc-500">No image on file.</p>
        )}
      </div>
    </div>
  );
}

export default async function AdminJobProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/admin");
  }

  const { id } = await params;
  const jobId = id.trim();
  if (!jobId) notFound();

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) notFound();

  const dwelling = classifyDwellingForAdmin(job.dwellingType);
  const shoppingRows = normalizeShoppingListForDisplay(job.shoppingList);
  const laborParsed = parseLaborBreakdownForDisplay(job.laborBreakdown, job.estimatedHours);
  const marginPct =
    laborParsed.carpentryMarginMultiplier !== null
      ? Math.round((laborParsed.carpentryMarginMultiplier - 1) * 100)
      : 15;

  const callOut = CALL_OUT_FEE_CAD;
  const materials = job.materialCost;
  const depositDue = job.immediateCharge;

  const showWorkOrder = job.status === "CURRENT_JOB" || job.status === "COMPLETED";

  const canSubmitProposal =
    job.status === "PENDING_REVIEW" &&
    Boolean(job.portalUserId?.trim() && job.workProposalId?.trim());

  const submitDisabledReason = !job.portalUserId?.trim()
    ? "Job needs a linked portal user."
    : !job.workProposalId?.trim()
      ? "Job needs a linked work proposal."
      : job.status !== "PENDING_REVIEW"
        ? "Proposal already sent or job is past review."
        : undefined;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* CRM-style shell */}
        <div className="rounded-xl border border-teal-900/40 bg-teal-950/25 p-4 md:p-5">
          <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-200/90">
                Structured job profile
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-all font-mono text-lg font-semibold text-white md:text-xl">
                  {job.id}
                </h1>
                <span className="text-xs text-zinc-500">·</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Status
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClasses(job.status)}`}
                  >
                    {job.status}
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                Created{" "}
                {job.createdAt.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {showWorkOrder ? (
                <p className="rounded-lg border border-amber-800/50 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-100/95">
                  <strong className="text-amber-50">Installer work order</strong> — blueprint and shopping
                  list are approved for site use.
                  {job.status === "COMPLETED" ? " Job archived as completed." : ""}
                </p>
              ) : null}
            </div>

            <div className="flex flex-shrink-0 flex-col gap-3 sm:items-end">
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <SubmitProposalToClientButton
                  jobId={job.id}
                  disabled={!canSubmitProposal}
                  disabledReason={submitDisabledReason}
                />
                <Link
                  href={`/admin/structured-jobs/${encodeURIComponent(job.id)}/review`}
                  className="rounded-lg border border-teal-700 bg-teal-950/50 px-4 py-2 text-sm font-medium text-teal-100 hover:bg-teal-900/50"
                >
                  Review &amp; edit
                </Link>
                <Link
                  href="/admin"
                  className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800/80"
                >
                  ← CRM home
                </Link>
              </div>
              <p className="max-w-md text-left text-[11px] leading-snug text-zinc-500 sm:text-right">
                Email proposal sends checkout links, marks{" "}
                <span className="font-mono text-zinc-400">PROPOSAL_SENT</span>, and notifies the client when
                Gmail / Twilio are configured.
              </p>
            </div>
          </div>

          {/* Two-column body */}
          <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:items-start">
            {/* Left: visuals */}
            <div className="space-y-6">
              <VisualPane
                title="AI blueprint"
                subtitle="2D technical drawing from the planner pipeline (Gemini / extraction)."
                src={job.blueprintUrl}
                alt="AI blueprint"
              />
              <VisualPane
                title="3D design"
                subtitle="Agreed render used for client sign-off."
                src={job.renderUrl}
                alt="3D design render"
              />
            </div>

            {/* Right: client + logistics */}
            <div className="space-y-6">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Client info
                </h2>
                <dl className="mt-4 space-y-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <dt className="text-zinc-500">Phone</dt>
                    <dd className="font-medium text-white">{job.customerPhone?.trim() || "—"}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <dt className="text-zinc-500">Email</dt>
                    <dd className="break-all text-right font-medium text-white">
                      {job.customerEmail?.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <dt className="text-zinc-500">Portal user</dt>
                    <dd className="break-all font-mono text-xs text-zinc-300">
                      {job.portalUserId?.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Dwelling</dt>
                    <dd className="mt-1 font-semibold text-teal-200">{dwelling.label}</dd>
                    <dd className="mt-1 text-xs text-zinc-500">{dwelling.detail}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-violet-900/40 bg-violet-950/25 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-violet-200/90">
                  Design intent (Alex intake)
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  Project North Star from phased planner conversation — persisted when the customer submits for
                  review (Gemini extraction).
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-zinc-500">Category</dt>
                    <dd className="mt-1 font-medium text-zinc-100">
                      {job.designCategory?.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Style</dt>
                    <dd className="mt-1 font-medium text-zinc-100">
                      {job.designStyle?.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Scope notes</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                      {job.scopeNotes?.trim() || "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Logistics
                </h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                    <dt className="text-zinc-500">Floor level</dt>
                    <dd className="font-medium text-white">{job.floorLevel}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                    <dt className="text-zinc-500">Elevator / access</dt>
                    <dd className="text-right font-medium text-white">
                      {job.hasElevator ? "Elevator / yes" : "Walk-up / no elevator"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                    <dt className="text-zinc-500">Site type</dt>
                    <dd className="text-right font-medium text-teal-100">{dwelling.label}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                    <dt className="text-zinc-500">Floor buffer</dt>
                    <dd className="tabular-nums font-medium text-amber-200">
                      {(laborParsed.floorAccessBufferHours ?? 0) > 0
                        ? `+${laborParsed.floorAccessBufferHours!.toFixed(2)} h`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                    <dt className="text-zinc-500">Condo / loading buffer</dt>
                    <dd className="tabular-nums font-medium text-amber-200">
                      {(laborParsed.condoBufferHours ?? 0) > 0
                        ? `+${laborParsed.condoBufferHours!.toFixed(2)} h`
                        : dwelling.label === "Condominium / strata"
                          ? "0 h"
                          : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-zinc-500">Envelope</dt>
                    <dd className="text-right font-medium text-white">
                      {job.width}&quot; W × {job.height}&quot; H × {job.depth}&quot; D
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 rounded-lg border border-zinc-800 bg-black/25 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Labor estimate ({marginPct}% carpentry buffer)
                  </p>
                  <p className="mt-2 tabular-nums text-sm font-semibold text-teal-200">
                    {job.estimatedHours.toFixed(2)} h total
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Labor hold on record:{" "}
                    <span className="tabular-nums text-zinc-300">{cad(job.totalLaborHold)}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Shopping list — full width */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
                Material shopping list
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                Live line-item pricing from{" "}
                <strong className="font-medium text-zinc-400">Gemini extraction</strong> (shown when the
                pipeline captured <span className="font-mono text-zinc-500">estimatedCad</span> / unit
                prices). Sourcing links open saved retailer URLs or a discovery search.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <AdminJobShoppingTable rows={shoppingRows} />
          </div>
        </section>

        {/* Deposit & financials */}
        <section className="rounded-xl border border-teal-900/40 bg-teal-950/20 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-200/90">
            Financial summary
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-300/90">
                Deposit due (call-out + materials)
              </p>
              <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight text-white">
                {cad(depositDue)}
              </p>
              <ul className="mt-4 space-y-2 border-t border-zinc-800 pt-4 text-sm">
                <li className="flex justify-between gap-4">
                  <span className="text-zinc-400">Call-out fee</span>
                  <span className="tabular-nums font-medium text-zinc-100">{cad(callOut)}</span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-zinc-400">Materials (from scope)</span>
                  <span className="tabular-nums font-medium text-zinc-100">{cad(materials)}</span>
                </li>
                <li className="flex justify-between gap-4 border-t border-zinc-800 pt-3 font-semibold">
                  <span className="text-teal-100/90">Deposit due</span>
                  <span className="tabular-nums text-white">{cad(depositDue)}</span>
                </li>
              </ul>
              {job.paymentAmountCents !== null ? (
                <p className="mt-4 font-mono text-[11px] text-zinc-500">
                  Stripe checkout amount: {job.paymentAmountCents}¢ CAD
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Labor authorization hold
              </p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-teal-200">
                {cad(job.totalLaborHold)}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                Separate manual-capture hold for labor beyond the included assessment window — not part of
                the deposit due above.
              </p>
            </div>
          </div>
        </section>

        <JobProfileStatusPanel jobId={job.id} status={job.status} />
      </div>
    </main>
  );
}
