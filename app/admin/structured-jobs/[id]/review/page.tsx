"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ShoppingRow = {
  description?: string;
  estimatedCad?: number;
  qty?: number | null;
  notes?: string | null;
};

type JobDetailResponse = {
  job: {
    id: string;
    createdAt: string;
    status: string;
    customerPhone: string;
    customerEmail: string;
    portalUserId: string | null;
    workProposalId: string | null;
    width: number;
    height: number;
    depth: number;
    dwellingType: string;
    floorLevel: number;
    hasElevator: boolean;
    renderUrl: string | null;
    blueprintUrl: string | null;
    shoppingList: unknown;
    materialCost: number;
    estimatedHours: number;
    totalLaborHold: number;
    immediateCharge: number;
    paymentAmountCents: number | null;
    stripeCheckoutSessionId: string | null;
    stripeLaborHoldCheckoutSessionId: string | null;
    laborBreakdown: unknown;
    scopeOfWorkTerms: string | null;
    assignedCarpenterId: string | null;
  };
  proposal: {
    id: string;
    title: string;
    status: string;
    sentAt?: string | null;
  } | null;
};

function cad(n: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

export default function StructuredJobReviewPage() {
  const params = useParams();
  const idParam = params?.id;
  const jobId = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<JobDetailResponse | null>(null);

  const [materialCostInput, setMaterialCostInput] = useState("");
  const [hoursInput, setHoursInput] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/structured-jobs/${encodeURIComponent(jobId)}`);
      const json = (await res.json()) as { error?: string } & Partial<JobDetailResponse>;
      if (!res.ok) {
        setError(json.error || "Could not load job.");
        setData(null);
        return;
      }
      setData(json as JobDetailResponse);
      if (json.job) {
        setMaterialCostInput(String(json.job.materialCost));
        setHoursInput(String(json.job.estimatedHours));
      }
    } catch {
      setError("Could not load job.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shoppingRows = useMemo((): ShoppingRow[] => {
    const raw = data?.job.shoppingList;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => x && typeof x === "object") as ShoppingRow[];
  }, [data]);

  async function saveEdits() {
    if (!jobId || !data) return;
    setSaveBusy(true);
    setFlash(null);
    try {
      const materialCost = parseFloat(materialCostInput.replace(/,/g, ""));
      const estimatedHours = parseFloat(hoursInput.replace(/,/g, ""));
      if (!Number.isFinite(materialCost) || materialCost < 0) {
        setFlash({ type: "err", message: "Material cost must be a valid non-negative number." });
        return;
      }
      if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
        setFlash({ type: "err", message: "Estimated hours must be greater than zero." });
        return;
      }
      const res = await fetch(`/api/admin/structured-jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialCost, estimatedHours }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "err", message: json.error || "Save failed." });
        return;
      }
      setFlash({ type: "ok", message: "Pricing updated." });
      setEditOpen(false);
      await load();
    } finally {
      setSaveBusy(false);
    }
  }

  async function sendProposal() {
    if (!jobId) return;
    setSendBusy(true);
    setFlash(null);
    try {
      const res = await fetch(
        `/api/admin/structured-jobs/${encodeURIComponent(jobId)}/send-proposal`,
        { method: "POST" },
      );
      const json = (await res.json()) as {
        error?: string;
        proposalLink?: string;
      };
      if (!res.ok) {
        setFlash({ type: "err", message: json.error || "Send failed." });
        return;
      }
      setFlash({
        type: "ok",
        message: `Proposal emailed. Client link: ${json.proposalLink ?? "(see CRM)"}`,
      });
      await load();
    } finally {
      setSendBusy(false);
    }
  }

  if (!jobId) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
        <p>Missing job id.</p>
        <Link href="/admin" className="mt-4 inline-block text-teal-400 underline">
          Back to admin
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-300">
        <p>Loading job…</p>
      </main>
    );
  }

  if (error || !data?.job) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
        <p className="text-rose-400">{error || "Not found."}</p>
        <Link href="/admin" className="mt-4 inline-block text-teal-400 underline">
          Back to admin
        </Link>
      </main>
    );
  }

  const job = data.job;
  const proposal = data.proposal;
  const canSend =
    job.status === "PENDING_REVIEW" &&
    Boolean(job.portalUserId && job.workProposalId && proposal && proposal.status !== "paid");

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Structured job review</p>
            <h1 className="mt-1 font-mono text-lg text-white">{job.id}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Status: <span className="text-teal-300">{job.status}</span>
              {proposal ? (
                <>
                  {" "}
                  · Proposal: <span className="text-zinc-200">{proposal.title}</span> ({proposal.status})
                </>
              ) : (
                <span className="text-amber-400"> · No linked proposal</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/jobs/${encodeURIComponent(jobId)}/profile`}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              Full profile
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              ← Admin CRM
            </Link>
          </div>
        </div>

        {flash ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              flash.type === "ok"
                ? "border-emerald-800 bg-emerald-950/50 text-emerald-100"
                : "border-rose-800 bg-rose-950/40 text-rose-100"
            }`}
          >
            {flash.message}
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-semibold text-white">Installer blueprint</h2>
            <div className="mt-4 flex min-h-[200px] items-center justify-center rounded-lg border border-zinc-800 bg-black/40">
              {job.blueprintUrl?.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin data URLs from Gemini
                <img
                  src={job.blueprintUrl}
                  alt="Technical blueprint"
                  className="max-h-[420px] w-full object-contain"
                />
              ) : (
                <p className="text-sm text-zinc-500">No blueprint image stored for this job.</p>
              )}
            </div>
            {job.renderUrl?.startsWith("data:") ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-zinc-500">Show agreed render</summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={job.renderUrl}
                  alt="Concept render"
                  className="mt-2 max-h-64 w-full object-contain"
                />
              </details>
            ) : null}
          </section>

          <section className="space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Billing breakdown</h2>
                <button
                  type="button"
                  onClick={() => setEditOpen((v) => !v)}
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  {editOpen ? "Close edit" : "Edit"}
                </button>
              </div>

              <dl className="mt-4 grid gap-2 text-sm text-zinc-300">
                <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                  <dt>Envelope</dt>
                  <dd className="tabular-nums text-zinc-100">
                    {job.width}&quot; × {job.height}&quot; × {job.depth}&quot;
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                  <dt>Materials (CAD)</dt>
                  <dd className="tabular-nums">{cad(job.materialCost)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                  <dt>Est. labor hours</dt>
                  <dd className="tabular-nums">{job.estimatedHours.toFixed(2)} h</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-zinc-800/80 py-2">
                  <dt>Labor hold (manual capture)</dt>
                  <dd className="tabular-nums">{cad(job.totalLaborHold)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt>Immediate charge (call-out + materials)</dt>
                  <dd className="tabular-nums font-semibold text-teal-200">{cad(job.immediateCharge)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2 text-xs text-zinc-500">
                  <dt>Checkout cents override</dt>
                  <dd>{job.paymentAmountCents ?? "—"}</dd>
                </div>
              </dl>

              {editOpen ? (
                <div className="mt-4 space-y-3 rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
                  <label className="block text-xs text-zinc-400">
                    Material total (CAD)
                    <input
                      type="text"
                      value={materialCostInput}
                      onChange={(e) => setMaterialCostInput(e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Estimated total labor hours
                    <input
                      type="text"
                      value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={saveBusy}
                    onClick={() => void saveEdits()}
                    className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                  >
                    {saveBusy ? "Saving…" : "Save pricing"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="text-sm font-semibold text-white">Scope of work &amp; billing terms</h2>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-300">
                {job.scopeOfWorkTerms?.trim() || "(No scope text on job row.)"}
              </pre>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="text-sm font-semibold text-white">Labor breakdown (JSON)</h2>
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-400">
                {JSON.stringify(job.laborBreakdown, null, 2)}
              </pre>
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-white">Shopping list</h2>
          {shoppingRows.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No line items in shopping_list JSON.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-zinc-700 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">Est. CAD</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  {shoppingRows.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3">{row.description ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.qty ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.estimatedCad !== undefined ? cad(row.estimatedCad) : "—"}
                      </td>
                      <td className="py-2 text-xs text-zinc-500">{row.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
        </section>

        <section className="rounded-xl border border-teal-900/60 bg-teal-950/20 p-5">
          <h2 className="text-sm font-semibold text-teal-100">Send to client</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Updates the formal proposal with scope &amp; billing appendix, creates Stripe Checkout (immediate +
            labor hold when applicable), emails the client with proposal + payment links, sends SMS when
            Twilio is configured, and sets job status to{" "}
            <code className="text-teal-300">PROPOSAL_SENT</code>.
          </p>
          <button
            type="button"
            disabled={!canSend || sendBusy}
            title={
              !canSend
                ? "Requires PENDING_REVIEW, linked portal proposal, and unpaid status."
                : undefined
            }
            onClick={() => void sendProposal()}
            className="mt-4 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sendBusy ? "Sending…" : "Send proposal"}
          </button>
        </section>
      </div>
    </main>
  );
}
