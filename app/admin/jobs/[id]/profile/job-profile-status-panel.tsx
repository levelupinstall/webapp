"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  STRUCTURED_JOB_PIPELINE,
  canMarkCompleted,
  canMockPaymentSuccess,
  canSendProposalStatus,
  pipelineIndex,
} from "@/lib/structured-job-status-flow";

export function JobProfileStatusPanel({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const activeIdx = pipelineIndex(status);

  async function postAction(action: "send_proposal" | "mock_payment_success" | "mark_completed") {
    if (busy) return;
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/structured-jobs/${encodeURIComponent(jobId)}/job-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "Request failed." });
        return;
      }
      setMessage({
        type: "ok",
        text: `Status updated to ${data.status ?? "OK"}.`,
      });
      router.refresh();
    } catch {
      setMessage({ type: "err", text: "Network error." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
            Status pipeline
          </h2>
          <p className="mt-1 max-w-xl text-xs text-zinc-500">
            Intended flow:{" "}
            <span className="font-mono text-zinc-400">
              {STRUCTURED_JOB_PIPELINE.join(" → ")}
            </span>
            . CRM tabs treat{" "}
            <span className="font-mono text-zinc-400">PENDING_REVIEW</span> and{" "}
            <span className="font-mono text-zinc-400">PROPOSAL_SENT</span> as Pending, and{" "}
            <span className="font-mono text-zinc-400">CURRENT_JOB</span> as Current.
          </p>
        </div>
      </div>

      <ol className="mt-5 flex flex-wrap gap-2">
        {STRUCTURED_JOB_PIPELINE.map((step, i) => {
          const isDone = activeIdx >= 0 && i < activeIdx;
          const isCurrent = activeIdx >= 0 && i === activeIdx;
          const isPending = activeIdx >= 0 && i > activeIdx;
          return (
            <li key={step} className="flex items-center gap-2">
              {i > 0 ? (
                <span className="text-zinc-600" aria-hidden>
                  →
                </span>
              ) : null}
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium ${
                  isCurrent
                    ? "border-teal-600 bg-teal-950/70 text-teal-100"
                    : isDone
                      ? "border-zinc-600 bg-zinc-800/80 text-zinc-300 line-through decoration-zinc-500"
                      : isPending
                        ? "border-zinc-700 bg-zinc-950/50 text-zinc-500"
                        : "border-zinc-700 bg-zinc-950/50 text-zinc-500"
                }`}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>

      {activeIdx < 0 ? (
        <p className="mt-3 text-xs text-amber-200/90">
          Current status <span className="font-mono text-amber-100">{status}</span> is outside this
          pipeline. Only compatible actions below are enabled.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3 border-t border-zinc-800 pt-5">
        <button
          type="button"
          disabled={!canSendProposalStatus(status) || busy !== null}
          onClick={() => void postAction("send_proposal")}
          className="rounded-lg border border-violet-600 bg-violet-950/50 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "send_proposal" ? "Updating…" : "Send proposal"}
        </button>
        <p className="w-full text-[11px] text-zinc-500 sm:w-auto sm:flex-1 sm:min-w-[200px]">
          Sets job status to{" "}
          <span className="font-mono text-zinc-400">PROPOSAL_SENT</span> from{" "}
          <span className="font-mono text-zinc-400">PENDING_REVIEW</span>. Does not email the client;
          use <strong className="text-zinc-400">Email proposal to client</strong> for checkout links
          and notifications.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
        <button
          type="button"
          disabled={!canMockPaymentSuccess(status) || busy !== null}
          onClick={() => void postAction("mock_payment_success")}
          className="rounded-lg border border-amber-600 bg-amber-950/60 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "mock_payment_success" ? "Applying…" : "Mock payment success"}
        </button>
        <p className="text-[11px] leading-relaxed text-amber-200/80 sm:flex-1 sm:min-w-[240px]">
          Testing shortcut: sets{" "}
          <span className="font-mono text-amber-100">CURRENT_JOB</span> (same outcome as a paid Stripe
          webhook once checkout is wired). Refreshes this page and the CRM Pending / Current lists.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!canMarkCompleted(status) || busy !== null}
          onClick={() => void postAction("mark_completed")}
          className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "mark_completed" ? "Updating…" : "Mark completed"}
        </button>
        <p className="text-[11px] text-zinc-500 sm:flex-1 sm:min-w-[200px]">
          Moves from <span className="font-mono text-zinc-400">CURRENT_JOB</span> to{" "}
          <span className="font-mono text-zinc-400">COMPLETED</span>.
        </p>
      </div>

      {message ? (
        <p
          className={`mt-4 text-sm ${message.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
