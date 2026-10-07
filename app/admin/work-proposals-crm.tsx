"use client";

import { useCallback, useMemo, useState } from "react";

import type { ChangeOrder } from "@/lib/client-portal-store";

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
  spacePhotos?: Array<{ id: string; mimeType: string; dataUrl: string; caption?: string }>;
  budgetNotes?: string;
  renderings?: Array<{ id: string; mimeType: string; dataUrl: string; caption?: string }>;
  changeOrders?: ChangeOrder[];
  shopDrawingDims?: Array<{
    id: string;
    wallLabel: string;
    name: string;
    expectedIn: number;
    known: boolean;
  }>;
  siteMeasure?: {
    verifiedAt: string;
    actuals: Record<string, number>;
    notes: string;
  } | null;
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

      {proposal.budgetNotes?.trim() ? (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/50 px-3 py-2 text-[11px] text-amber-100">
          <span className="font-medium text-amber-400">Budget cues (from AI planner): </span>
          {proposal.budgetNotes}
        </div>
      ) : null}

      {(proposal.spacePhotos?.length || proposal.renderings?.length) ? (
        <div className="space-y-3">
          {proposal.spacePhotos?.length ? (
            <div>
              <h5 className="text-[11px] font-semibold uppercase text-zinc-500">
                Customer space photos
              </h5>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {proposal.spacePhotos.map((ph) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={ph.id}
                    src={ph.dataUrl}
                    alt={ph.caption || "Space"}
                    className="max-h-48 w-full rounded-lg border border-zinc-800 object-contain"
                  />
                ))}
              </div>
            </div>
          ) : null}
          {proposal.renderings?.length ? (
            <div>
              <h5 className="text-[11px] font-semibold uppercase text-zinc-500">
                Agreed concept renderings
              </h5>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {proposal.renderings.map((ph) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={ph.id}
                    src={ph.dataUrl}
                    alt={ph.caption || "Rendering"}
                    className="max-h-48 w-full rounded-lg border border-zinc-800 object-contain"
                  />
                ))}
              </div>
            </div>
          ) : null}
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

      <ChangeOrdersSection
        portalUserId={portalUserId}
        proposal={proposal}
        onRefresh={onRefresh}
      />

      <SiteMeasureSection
        portalUserId={portalUserId}
        proposal={proposal}
        onRefresh={onRefresh}
      />

      <FabricationSection
        portalUserId={portalUserId}
        proposal={proposal}
      />

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

function SiteMeasureSection(props: {
  portalUserId: string;
  proposal: WorkProposalRow;
  onRefresh: () => void | Promise<void>;
}) {
  const { portalUserId, proposal, onRefresh } = props;
  const dims = proposal.shopDrawingDims ?? [];
  const [actuals, setActuals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(proposal.siteMeasure?.actuals ?? {})) {
      init[k] = String(v);
    }
    return init;
  });
  const [notes, setNotes] = useState(proposal.siteMeasure?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const TOLERANCE_IN = 0.5;

  const rows = dims.map((d) => {
    const raw = (actuals[d.id] ?? "").trim();
    const actual = raw ? Number(raw) : null;
    const valid = actual !== null && Number.isFinite(actual) && actual > 0;
    const diff = valid ? Math.abs(actual - d.expectedIn) : null;
    // Unknown ("?") dims just need a confirmed value; known dims must match.
    const pass = valid && (d.known ? diff !== null && diff <= TOLERANCE_IN : true);
    return { d, raw, actual: valid ? actual : null, diff, pass };
  });
  const entered = rows.filter((r) => r.actual !== null);
  const failed = rows.filter((r) => r.actual !== null && !r.pass);
  const allEntered = dims.length > 0 && entered.length === dims.length;
  const verified = allEntered && failed.length === 0;

  const save = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const payload: Record<string, number> = {};
      for (const r of rows) {
        if (r.actual !== null) payload[r.d.id] = r.actual;
      }
      const res = await fetch("/api/admin/work-proposals/site-measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUserId,
          proposalId: proposal.id,
          actuals: payload,
          notes,
        }),
      });
      if (!res.ok) throw new Error("Save failed.");
      setFlash({ type: "ok", message: "Site measure saved." });
      await onRefresh();
    } catch {
      setFlash({ type: "err", message: "Could not save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-zinc-800 pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-[11px] font-semibold uppercase text-zinc-500">
          Site measure {dims.length ? `(${entered.length}/${dims.length})` : ""}
        </h5>
        {dims.length > 0 ? (
          verified ? (
            <span className="rounded-full bg-emerald-950/60 border border-emerald-900/50 px-3 py-1 text-[11px] font-medium text-emerald-300">
              Verified — matches drawings, work can start
            </span>
          ) : failed.length > 0 ? (
            <span className="rounded-full bg-rose-950/60 border border-rose-900/50 px-3 py-1 text-[11px] font-medium text-rose-300">
              {failed.length} mismatch{failed.length === 1 ? "" : "es"} — review before ordering
            </span>
          ) : (
            <span className="rounded-full bg-amber-950/60 border border-amber-900/50 px-3 py-1 text-[11px] font-medium text-amber-300">
              Pending site visit
            </span>
          )
        ) : null}
      </div>

      <p className="text-xs text-zinc-500">
        After the deposit, confirm each shop-drawing dimension on site. Known dims must match
        within {TOLERANCE_IN}&Prime;; &ldquo;?&rdquo; dims just need a confirmed value.
      </p>

      {dims.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No shop drawings on this proposal yet — they&rsquo;re generated when the planner
          produces dimensioned elevations.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.d.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 text-xs ${
                r.actual === null
                  ? "border-zinc-800 bg-zinc-950/60"
                  : r.pass
                    ? "border-emerald-900/50 bg-emerald-950/30"
                    : "border-rose-900/50 bg-rose-950/30"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100 capitalize">
                  {r.d.wallLabel} — {r.d.name}
                </p>
                <p className="mt-0.5 text-zinc-400">
                  Drawing: {r.d.expectedIn}&Prime; {!r.d.known ? <span className="text-amber-300">(assumed — confirm)</span> : null}
                  {r.diff !== null ? (
                    <span className={r.pass ? "text-emerald-300" : "text-rose-300"}>
                      {" "}· off by {r.diff.toFixed(1)}&Prime;
                    </span>
                  ) : null}
                </p>
              </div>
              <label className="flex items-center gap-2 text-zinc-400">
                Actual
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={r.raw}
                  onChange={(e) =>
                    setActuals((prev) => ({ ...prev, [r.d.id]: e.target.value }))
                  }
                  placeholder={String(r.d.expectedIn)}
                  className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
                />
                <span>&Prime;</span>
              </label>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  r.actual === null
                    ? "bg-zinc-800 text-zinc-400"
                    : r.pass
                      ? "bg-emerald-950/70 text-emerald-300 border border-emerald-900/50"
                      : "bg-rose-950/70 text-rose-300 border border-rose-900/50"
                }`}
              >
                {r.actual === null ? "Not measured" : r.pass ? "Match" : "Mismatch"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {dims.length > 0 ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Site notes (obstructions, uneven walls, outlet positions…)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save site measure"}
            </button>
            {proposal.siteMeasure?.verifiedAt ? (
              <span className="text-[11px] text-zinc-500">
                Last saved {new Date(proposal.siteMeasure.verifiedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {flash ? (
        <p className={`text-xs ${flash.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
          {flash.message}
        </p>
      ) : null}
    </div>
  );
}

function FabricationSection(props: {
  portalUserId: string;
  proposal: WorkProposalRow;
}) {
  const { portalUserId, proposal } = props;
  const [sheets, setSheets] = useState<
    Array<{ wallLabel: string; kind: string; caption: string; mimeType: string; dataBase64: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const generate = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(
        `/api/admin/work-proposals/fabrication?portalUserId=${encodeURIComponent(portalUserId)}&proposalId=${encodeURIComponent(proposal.id)}`,
      );
      const data = (await res.json()) as {
        sheets?: typeof sheets;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      setSheets(data.sheets ?? []);
      setFlash({ type: "ok", message: `${data.sheets?.length ?? 0} fabrication sheets generated.` });
    } catch (e) {
      setFlash({ type: "err", message: e instanceof Error ? e.message : "Could not generate. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-zinc-800 pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-[11px] font-semibold uppercase text-zinc-500">
          Fabrication package <span className="text-zinc-600 normal-case">(internal — never shown to customers)</span>
        </h5>
        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/work-proposals/fabrication/pdf?portalUserId=${encodeURIComponent(portalUserId)}&proposalId=${encodeURIComponent(proposal.id)}`}
            className={`rounded-lg px-4 py-2 text-xs font-medium text-white ${(proposal.shopDrawingDims ?? []).length === 0 ? "pointer-events-none bg-zinc-700 opacity-50" : "bg-emerald-700 hover:bg-emerald-600"}`}
          >
            Download PDF package
          </a>
          <button
            type="button"
            disabled={busy || (proposal.shopDrawingDims ?? []).length === 0}
            onClick={() => void generate()}
            className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
          >
            {busy ? "Generating…" : sheets.length ? "Regenerate sheets" : "Preview sheets"}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Elevation + section + cut list per wall, generated from the shop-drawing dimensions.
        The PDF package is what you send to fabricators and installers. Anything marked *
        or TYP is shop standard — confirm on site.
      </p>
      {sheets.map((s, i) => (
        <figure key={`${s.wallLabel}-${s.kind}-${i}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <figcaption className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-300">
            <span className="font-medium">{s.caption}</span>
            <a
              href={`data:${s.mimeType};base64,${s.dataBase64}`}
              download={`${proposal.id}-${s.wallLabel}-${s.kind}.png`}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-zinc-700"
            >
              Download PNG
            </a>
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${s.mimeType};base64,${s.dataBase64}`}
            alt={s.caption}
            className="w-full rounded-md bg-white"
          />
        </figure>
      ))}
      {flash ? (
        <p className={`text-xs ${flash.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
          {flash.message}
        </p>
      ) : null}
    </div>
  );
}

function ChangeOrdersSection(props: {
  portalUserId: string;
  proposal: WorkProposalRow;
  onRefresh: () => void | Promise<void>;
}) {
  const { portalUserId, proposal, onRefresh } = props;
  const changeOrders = proposal.changeOrders ?? [];
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [lines, setLines] = useState<
    Array<{ description: string; quantity: string; unit: string; unitCost: string }>
  >([{ description: "", quantity: "1", unit: "each", unitCost: "" }]);
  const [busy, setBusy] = useState<"" | "create" | string>("");
  const [flash, setFlash] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const approvedTotal = changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.totalCad, 0);
  const formTotal = lines.reduce(
    (s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitCost) || 0),
    0,
  );

  const setLine = (
    i: number,
    patch: Partial<{ description: string; quantity: string; unit: string; unitCost: string }>,
  ) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const create = useCallback(async () => {
    setBusy("create");
    setFlash(null);
    try {
      const res = await fetch("/api/admin/change-orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUserId,
          proposalId: proposal.id,
          title,
          description,
          internalNote,
          lineItems: lines
            .filter((l) => l.description.trim())
            .map((l) => ({
              description: l.description.trim(),
              quantity: parseFloat(l.quantity) || 0,
              unit: l.unit.trim() || "each",
              unitCostCad: parseFloat(l.unitCost) || 0,
            })),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "err", message: json.error || "Could not create change order." });
        return;
      }
      setTitle("");
      setDescription("");
      setInternalNote("");
      setLines([{ description: "", quantity: "1", unit: "each", unitCost: "" }]);
      setFormOpen(false);
      setFlash({ type: "ok", message: "Change order proposed. Share the customer link so they can approve it." });
      await onRefresh();
    } catch {
      setFlash({ type: "err", message: "Something went wrong." });
    } finally {
      setBusy("");
    }
  }, [portalUserId, proposal.id, title, description, internalNote, lines, onRefresh]);

  const decide = useCallback(
    async (changeOrderId: string, decision: "approved" | "rejected") => {
      setBusy(changeOrderId);
      setFlash(null);
      try {
        const res = await fetch("/api/admin/change-orders/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalUserId, proposalId: proposal.id, changeOrderId, decision }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          setFlash({ type: "err", message: json.error || "Could not record decision." });
          return;
        }
        setFlash({
          type: "ok",
          message: decision === "approved" ? "Change order approved." : "Change order declined.",
        });
        await onRefresh();
      } catch {
        setFlash({ type: "err", message: "Something went wrong." });
      } finally {
        setBusy("");
      }
    },
    [portalUserId, proposal.id, onRefresh],
  );

  return (
    <div className="border-t border-zinc-800 pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-[11px] font-semibold uppercase text-zinc-500">
          Change orders {changeOrders.length ? `(${changeOrders.length})` : ""}
        </h5>
        {approvedTotal > 0 ? (
          <span className="rounded-full bg-emerald-950/60 border border-emerald-900/50 px-3 py-1 text-[11px] font-medium text-emerald-300">
            Approved extra: {cadMoney(Math.round(approvedTotal * 100))} on top of quote
          </span>
        ) : null}
      </div>

      {changeOrders.length === 0 ? (
        <p className="text-xs text-zinc-500">
          None yet. When site conditions need extra work outside the approved scope, propose it
          here — the customer approves it on their proposal link before any extra work proceeds.
        </p>
      ) : (
        <ul className="space-y-2">
          {changeOrders.map((co) => (
            <li
              key={co.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{co.title}</p>
                  {co.description ? (
                    <p className="mt-1 whitespace-pre-wrap text-zinc-400">{co.description}</p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    co.status === "approved"
                      ? "bg-emerald-950/70 text-emerald-300 border border-emerald-900/50"
                      : co.status === "rejected"
                        ? "bg-zinc-800 text-zinc-400"
                        : "bg-amber-950/60 text-amber-300 border border-amber-900/50"
                  }`}
                >
                  {co.status === "approved" ? "Approved" : co.status === "rejected" ? "Declined" : "Proposed"}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-zinc-300">
                {co.lineItems.map((li, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2">
                    <span>
                      {li.description}
                      <span className="text-zinc-500">
                        {" "}· {li.quantity} {li.unit} @ ${li.unitCostCad.toFixed(2)}
                      </span>
                    </span>
                    <span className="font-medium">${li.totalCad.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right text-sm font-semibold text-zinc-100">
                {cadMoney(Math.round(co.totalCad * 100))}
              </p>
              {co.internalNote ? (
                <p className="mt-2 rounded-md border border-amber-900/40 bg-amber-950/40 px-2 py-1.5 text-amber-100/90">
                  <span className="font-medium text-amber-400">Internal only: </span>
                  {co.internalNote}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-zinc-500">
                Proposed {new Date(co.createdAt).toLocaleString()}
                {co.decidedAt
                  ? ` · ${co.status === "approved" ? "Approved" : "Declined"} ${new Date(co.decidedAt).toLocaleString()}${co.decidedBy ? ` by ${co.decidedBy}` : ""}${co.decidedVia === "customer" ? " (customer link)" : ""}`
                  : ""}
              </p>
              {co.status === "proposed" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== ""}
                    onClick={() => void decide(co.id, "approved")}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {busy === co.id ? "Saving…" : "Mark approved"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== ""}
                    onClick={() => void decide(co.id, "rejected")}
                    className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
                  >
                    {busy === co.id ? "Saving…" : "Mark declined"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="rounded-lg border border-violet-700/60 bg-violet-950/40 px-4 py-2 text-xs font-medium text-violet-200 hover:bg-violet-900/50"
        >
          + Propose change order
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
          <label className="block text-xs text-zinc-500">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rot repair behind vanity"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            What changed / added scope (customer sees this)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Found water damage behind the vanity during demo…"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Internal note — never shown to the customer (sub cost, target hours)
            <input
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="Sub cost $180 · target 3h · no buffer shown"
              className="mt-1 w-full rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
            />
          </label>
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">Line items</p>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input
                  value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  placeholder="Description"
                  className="col-span-6 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white"
                />
                <input
                  value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                  placeholder="Qty"
                  inputMode="decimal"
                  className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white"
                />
                <input
                  value={l.unit}
                  onChange={(e) => setLine(i, { unit: e.target.value })}
                  placeholder="Unit"
                  className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white"
                />
                <input
                  value={l.unitCost}
                  onChange={(e) => setLine(i, { unitCost: e.target.value })}
                  placeholder="$/unit"
                  inputMode="decimal"
                  className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setLines((prev) => [...prev, { description: "", quantity: "1", unit: "each", unitCost: "" }])
              }
              className="text-xs text-violet-300 underline"
            >
              + Add line
            </button>
          </div>
          <p className="text-right text-sm font-semibold text-zinc-100">
            Total: {cadMoney(Math.round(formTotal * 100))}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== "" || !title.trim()}
              onClick={() => void create()}
              className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
            >
              {busy === "create" ? "Saving…" : "Propose change order"}
            </button>
            <button
              type="button"
              disabled={busy !== ""}
              onClick={() => setFormOpen(false)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {flash ? (
        <p className={`text-xs ${flash.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
          {flash.message}
        </p>
      ) : null}
    </div>
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
