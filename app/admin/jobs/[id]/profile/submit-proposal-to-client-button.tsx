"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SubmitProposalToClientButton({
  jobId,
  disabled,
  disabledReason,
  buttonLabel = "Email proposal to client",
}: {
  jobId: string;
  disabled: boolean;
  disabledReason?: string;
  /** Defaults to CRM label for Job Profile. */
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    if (disabled || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/structured-jobs/${encodeURIComponent(jobId)}/send-proposal`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; proposalLink?: string };
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "Could not submit proposal." });
        return;
      }
      setMessage({
        type: "ok",
        text: "Proposal submitted — client notified by email (and SMS when configured).",
      });
      router.refresh();
    } catch {
      setMessage({ type: "err", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || busy}
        title={disabled ? disabledReason : undefined}
        onClick={() => void submit()}
        className="rounded-lg border border-violet-600 bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Sending…" : buttonLabel}
      </button>
      {message ? (
        <p
          className={`text-sm ${message.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
