"use client";

import { useCallback, useMemo, useState } from "react";

export type WorkProposalRow = {
  id: string;
  status: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  markdownBody: string;
  paymentAmountCents: number;
  viewToken: string;
  sentAt?: string;
  aiChat?: Array<{ role: string; content: string; at: string }>;
};

function cadMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function ProposalEditor(props: {
  portalUserId: string;
  proposal: WorkProposalRow;
  origin: string;
  onRefresh: () => void | Promise<void>;
}) {
  const { portalUserId, proposal, origin, onRefresh } = props;

  const [title, setTitle] = useState(proposal.title);
  const [markdownBody, setMarkdownBody] = useState(proposal.markdownBody);
  const [dollars, setDollars] = useState((proposal.paymentAmountCents / 100).toFixed(2));
  const [aiInstruction, setAiInstruction] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "ai" | "send">("");
  const [flash, setFlash] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const customerLink =
    origin && proposal.viewToken
      ? `${origin}/portal/proposal?t=${encodeURIComponent(proposal.viewToken)}`
      : "";

  const save = useCallback(async () => {
    setBusy("save");
    setFlash(null);
    try {
      const paymentAmountCents = Math.round(parseFloat(dollars) * 100);
      if (!Number.isFinite(paymentAmountCents) || paymentAmountCents < 1) {
        setFlash({ type: "err", message: "Enter a valid dollar amount." });
        return;
      }
      const res = await fetch("/api/admin/work-proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUserId,
          proposalId: proposal.id,
          title,
          markdownBody,
          paymentAmountCents,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "err", message: json.error || "Save failed." });
        return;
      }
      setFlash({ type: "ok", message: "Saved." });
      await onRefresh();
    } finally {
      setBusy("");
    }
  }, [portalUserId, proposal.id, dollars, title, markdownBody, onRefresh]);

  const askAi = useCallback(async () => {
    if (!aiInstruction.trim()) return;
    setBusy("ai");
    setFlash(null);
    try {
      const res = await fetch("/api/admin/work-proposals/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUserId,
          proposalId: proposal.id,
          message: aiInstruction.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "err", message: json.error || "AI update failed." });
        return;
      }
      setAiInstruction("");
      setFlash({ type: "ok", message: "Proposal updated from AI." });
      await onRefresh();
    } finally {
      setBusy("");
    }
  }, [portalUserId, proposal.id, aiInstruction, onRefresh]);

  const sendEmail = useCallback(async () => {
    setBusy("send");
    setFlash(null);
    try {
      const res = await fetch("/api/admin/work-proposals/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUserId,
          proposalId: proposal.id,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "err", message: json.error || "Send failed." });
        return;
      }
      setFlash({ type: "ok", message: "Email sent to customer." });
      await onRefresh();
    } finally {
      setBusy("");
    }
  }, [portalUserId, proposal.id, onRefresh]);

  return (
    <>
      <p className="text-[11px] text-zinc-500">
        Created {new Date(proposal.createdAt).toLocaleString()} · Updated{" "}
        {new Date(proposal.updatedAt).toLocaleString()}
        {proposal.sentAt ? ` · Sent ${new Date(proposal.sentAt).toLocaleString()}` : ""}
      </p>

      {customerLink ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-[11px] text-zinc-400">
          <span className="text-zinc-500">Customer link: </span>
          <span className="break-all text-zinc-300">{customerLink}</span>
        </div>
      ) : null}

      <label className="block text-xs text-zinc-500">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="block text-xs text-zinc-500">
        Payment amount (CAD, after acceptance)
        <input
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          inputMode="decimal"
        />
      </label>

      <label className="block text-xs text-zinc-500">
        Proposal body (Markdown)
        <textarea
          value={markdownBody}
          onChange={(e) => setMarkdownBody(e.target.value)}
          rows={14}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== ""}
          onClick={() => void save()}
          className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={busy !== "" || proposal.status === "paid"}
          onClick={() => void sendEmail()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy === "send" ? "Sending…" : "Email to customer"}
        </button>
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-2">
        <h5 className="text-[11px] font-semibold uppercase text-zinc-500">
          AI assistant (edits proposal)
        </h5>
        <textarea
          value={aiInstruction}
          onChange={(e) => setAiInstruction(e.target.value)}
          rows={3}
          placeholder="e.g. Add a section for shoe moulding notes and bump installer hours by 4h."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          disabled={busy !== "" || !aiInstruction.trim()}
          onClick={() => void askAi()}
          className="rounded-lg bg-zinc-700 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
        >
          {busy === "ai" ? "Updating…" : "Apply with AI"}
        </button>
      </div>

      {(proposal.aiChat ?? []).length > 0 ? (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-[11px] text-zinc-400">
          {(proposal.aiChat ?? []).map((t, i) => (
            <p key={`${t.at}-${i}`} className="mt-1 whitespace-pre-wrap">
              <span className="text-violet-400">{t.role}:</span> {t.content}
            </p>
          ))}
        </div>
      ) : null}

      {flash ? (
        <p className={`text-xs ${flash.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
          {flash.message}
        </p>
      ) : null}
    </>
  );
}

export function WorkProposalsCrm(props: {
  portalUserId: string;
  proposals: WorkProposalRow[];
  onRefresh: () => void | Promise<void>;
}) {
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );

  const sorted = useMemo(
    () =>
      [...props.proposals].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [props.proposals],
  );

  const [pickedId, setPickedId] = useState<string | null>(null);

  const selectedId = useMemo(() => {
    if (pickedId && sorted.some((p) => p.id === pickedId)) return pickedId;
    return sorted[0]?.id ?? "";
  }, [sorted, pickedId]);

  const selected = sorted.find((p) => p.id === selectedId) ?? null;

  if (!sorted.length) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
        <h4 className="text-xs font-semibold uppercase text-zinc-500">Formal proposals</h4>
        <p className="mt-2 text-sm text-zinc-400">
          No proposals yet. When the customer is signed in, they can tap{" "}
          <span className="text-zinc-200">Request formal proposal</span> in the AI planner to generate a
          draft here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase text-zinc-500">Formal proposals</h4>
        {selected ? (
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-[11px] font-medium text-violet-300">
            {selected.status.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>

      <label className="block text-xs text-zinc-500">
        Select proposal
        <select
          value={selectedId}
          onChange={(e) => setPickedId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        >
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title.slice(0, 60)} · {cadMoney(p.paymentAmountCents)} · {p.status}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <ProposalEditor
          key={`${selected.id}-${selected.updatedAt}`}
          portalUserId={props.portalUserId}
          proposal={selected}
          origin={origin}
          onRefresh={props.onRefresh}
        />
      ) : null}
    </div>
  );
}
