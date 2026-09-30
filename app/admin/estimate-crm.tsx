"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type EstimateRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  lineItems: Array<{
    id: string;
    category: "material" | "labor" | "fee";
    sourcing: "buy" | "build" | "na";
    description: string;
    detail?: string;
    quantity: number;
    unit: string;
    unitCostCad: number;
    totalCad: number;
    assignee?: "tom" | "sub";
    subRateCad?: number;
  }>;
  materialsTotalCad: number;
  laborHours: number;
  laborTotalCad: number;
  feesTotalCad: number;
  totalCad: number;
  subcontractedCostCad: number;
  laborMarginCad: number;
  assignedCarpenterId?: string | null;
  notes: string;
  aiChat: Array<{ role: string; content: string; at: string }>;
  sourceSummary: string;
};

function cad(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(n);
}

function typeLabel(it: EstimateRow["lineItems"][number]): string {
  if (it.category === "labor") return "Labour";
  if (it.category === "fee") return "Fee";
  return it.sourcing === "buy" ? "Buy" : "Build";
}

export function EstimateCrm(props: {
  portalUserId: string;
  estimates: EstimateRow[];
  clientPhase: string;
  carpenters: Array<{ id: string; name: string }>;
  onRefresh: () => void | Promise<void>;
}) {
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  void origin;

  const sorted = useMemo(
    () =>
      [...props.estimates].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [props.estimates],
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedId = useMemo(() => {
    if (pickedId && sorted.some((e) => e.id === pickedId)) return pickedId;
    return sorted[0]?.id ?? "";
  }, [sorted, pickedId]);
  const selected = sorted.find((e) => e.id === selectedId) ?? null;

  const [busy, setBusy] = useState<"" | "generate" | "ai" | "send" | "status" | "convert" | "assign">("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [flash, setFlash] = useState<{ type: "ok" | "err"; message: string } | null>(null);
  const [defaultSubRateCad, setDefaultSubRateCad] = useState(50);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/rate-card")
      .then((r) => r.json())
      .then((j: { rateCard?: { defaultSubRateCad?: number } }) => {
        const v = j.rateCard?.defaultSubRateCad;
        if (!cancelled && typeof v === "number" && Number.isFinite(v) && v >= 0) {
          setDefaultSubRateCad(v);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const post = useCallback(
    async (path: string, payload: Record<string, unknown>) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalUserId: props.portalUserId, ...payload }),
      });
      const json = (await res.json()) as { error?: string; summary?: string };
      if (!res.ok) throw new Error(json.error || "Request failed.");
      return json;
    },
    [props.portalUserId],
  );

  const run = useCallback(
    async (kind: typeof busy, fn: () => Promise<void>, okMsg: string) => {
      setBusy(kind);
      setFlash(null);
      try {
        await fn();
        setFlash({ type: "ok", message: okMsg });
        await props.onRefresh();
      } catch (e) {
        setFlash({
          type: "err",
          message: e instanceof Error ? e.message : "Request failed.",
        });
      } finally {
        setBusy("");
      }
    },
    [props],
  );

  const generate = () => run("generate", () => post("/api/admin/estimates/generate", {}).then(() => undefined), "AI estimate drafted.");
  const askAi = () => {
    if (!selected || !aiInstruction.trim()) return;
    run(
      "ai",
      () =>
        post("/api/admin/estimates/chat", {
          estimateId: selected.id,
          message: aiInstruction.trim(),
        }).then(() => undefined),
      "Estimate updated from AI.",
    ).then(() => setAiInstruction(""));
  };
  const sendEmail = () =>
    selected &&
    run("send", () => post("/api/admin/estimates/send", { estimateId: selected.id }).then(() => undefined), "Estimate emailed to customer.");
  const markSiteMeasure = () =>
    selected &&
    run("status", () => post("/api/admin/estimates/status", { estimateId: selected.id, status: "site_measure" }).then(() => undefined), "Marked site measure scheduled.");
  const convert = () =>
    selected &&
    run("convert", () => post("/api/admin/estimates/convert", { estimateId: selected.id }).then(() => undefined), "Final quote created — review it under Formal proposals.");

  const setLineAssignee = (lineId: string, assignee: "tom" | "sub", subRateCad?: number) =>
    selected &&
    run(
      "assign",
      () =>
        post("/api/admin/estimates/assign", {
          estimateId: selected.id,
          lineId,
          assignee,
          ...(subRateCad !== undefined ? { subRateCad } : {}),
        }).then(() => undefined),
      assignee === "sub" ? "Labour assigned to sub." : "Labour assigned to Tom.",
    );

  const setInstaller = (carpenterId: string) =>
    selected &&
    run(
      "assign",
      () =>
        post("/api/admin/estimates/assign", {
          estimateId: selected.id,
          assignedCarpenterId: carpenterId || null,
        }).then(() => undefined),
      "Installer updated.",
    );

  const locked = selected && ["approved", "paid", "final_quote"].includes(selected.status);
  const canGenerate =
    !selected &&
    ["Design approved", "Call scheduled", "Estimate drafted", "Estimate sent"].includes(
      props.clientPhase,
    );

  const installerName = !selected?.assignedCarpenterId
    ? "Tom"
    : (props.carpenters.find((c) => c.id === selected.assignedCarpenterId)?.name ??
      "Unknown sub");

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase text-zinc-500">AI estimates</h4>
        {selected ? (
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-[11px] font-medium text-amber-300">
            {selected.status.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>

      {!selected ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">
            No estimate yet. The AI drafts materials, labour, and costs from the approved
            design and planning chat — you review and adjust before anything reaches the
            customer.
          </p>
          <button
            type="button"
            disabled={busy !== "" || !canGenerate}
            onClick={generate}
            title={canGenerate ? "" : "Available once the design is approved"}
            className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {busy === "generate" ? "Drafting…" : "Generate AI estimate"}
          </button>
        </div>
      ) : (
        <>
          {sorted.length > 1 ? (
            <label className="block text-xs text-zinc-500">
              Select estimate
              <select
                value={selectedId}
                onChange={(e) => setPickedId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                {sorted.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title.slice(0, 50)} · {cad(e.totalCad)} · {e.status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!locked ? (
            <label className="block text-xs text-zinc-500">
              Installer (who does the work)
              <select
                value={selected.assignedCarpenterId ?? ""}
                disabled={busy !== ""}
                onChange={(e) => setInstaller(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                <option value="">Tom (me)</option>
                {props.carpenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (sub)
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-xs text-zinc-500">
              Installer: <span className="text-zinc-300">{installerName}</span>
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead>
                <tr className="bg-zinc-900 text-[11px] uppercase text-zinc-500">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2 text-right">Unit</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Who</th>
                </tr>
              </thead>
              <tbody>
                {selected.lineItems.map((it) => {
                  const isLabor = it.category === "labor";
                  const assignee = it.assignee === "sub" ? "sub" : "tom";
                  const subRate = it.subRateCad ?? defaultSubRateCad;
                  const margin = isLabor && assignee === "sub" ? it.totalCad - it.quantity * subRate : 0;
                  return (
                    <tr key={it.id} className="border-t border-zinc-800/60">
                      <td className="px-3 py-2">
                        <span className="font-medium text-zinc-200">{it.description}</span>
                        {it.detail ? (
                          <span className="block text-[11px] text-zinc-500">{it.detail}</span>
                        ) : null}
                        {isLabor && assignee === "sub" ? (
                          <span className="block text-[11px] text-emerald-400">
                            Sub @ {cad(subRate)}/hr · margin {cad(margin)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            it.sourcing === "buy"
                              ? "bg-emerald-900/60 text-emerald-300"
                              : it.sourcing === "build"
                                ? "bg-sky-900/60 text-sky-300"
                                : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {typeLabel(it)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="px-3 py-2 text-right">{cad(it.unitCostCad)}</td>
                      <td className="px-3 py-2 text-right font-medium text-zinc-100">
                        {cad(it.totalCad)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isLabor && !locked ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busy !== ""}
                              onClick={() => setLineAssignee(it.id, "tom")}
                              title="Tom does this labour"
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                assignee === "tom"
                                  ? "bg-amber-700 text-white"
                                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              Tom
                            </button>
                            <button
                              type="button"
                              disabled={busy !== ""}
                              onClick={() => setLineAssignee(it.id, "sub", subRate)}
                              title="Subcontract this labour"
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                assignee === "sub"
                                  ? "bg-sky-700 text-white"
                                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              Sub
                            </button>
                          </span>
                        ) : isLabor ? (
                          <span className="text-[11px] text-zinc-500">
                            {assignee === "sub" ? "Sub" : "Tom"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!locked ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-[11px] text-zinc-500">
              <p>
                Sub rate defaults to {cad(defaultSubRateCad)}/hr from your rate card.
                Ask the AI to change a sub rate, e.g. “set the sub rate to $55 on the labour line”.
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 space-y-1">
            <p>Materials: <span className="text-zinc-200">{cad(selected.materialsTotalCad)}</span></p>
            <p>
              Labour ({selected.laborHours}h):{" "}
              <span className="text-zinc-200">{cad(selected.laborTotalCad)}</span>
            </p>
            {selected.subcontractedCostCad > 0 ? (
              <>
                <p>
                  Subcontracted cost:{" "}
                  <span className="text-zinc-200">{cad(selected.subcontractedCostCad)}</span>
                </p>
                <p>
                  Your labour margin:{" "}
                  <span className="text-emerald-300">{cad(selected.laborMarginCad)}</span>
                </p>
              </>
            ) : null}
            <p>Fees: <span className="text-zinc-200">{cad(selected.feesTotalCad)}</span></p>
            <p className="text-sm">
              Total: <span className="font-semibold text-amber-300">{cad(selected.totalCad)}</span>
            </p>
          </div>

          {selected.sourceSummary ? (
            <p className="text-[11px] text-zinc-600">{selected.sourceSummary}</p>
          ) : null}

          {selected.notes ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-zinc-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-300">{selected.notes}</p>
            </div>
          ) : null}

          {!locked ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={sendEmail}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {busy === "send" ? "Sending…" : "Email to customer"}
                </button>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={markSiteMeasure}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {busy === "status" ? "Saving…" : "Site measure scheduled"}
                </button>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={convert}
                  className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                >
                  {busy === "convert" ? "Converting…" : "Convert to final quote"}
                </button>
              </div>

              <div className="border-t border-zinc-800 pt-4 space-y-2">
                <h5 className="text-[11px] font-semibold uppercase text-zinc-500">
                  AI assistant (adjusts estimate)
                </h5>
                <textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  rows={3}
                  placeholder="e.g. Switch the shelves to white oak and add a 10% contingency line."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={busy !== "" || !aiInstruction.trim()}
                  onClick={askAi}
                  className="rounded-lg bg-zinc-700 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
                >
                  {busy === "ai" ? "Updating…" : "Apply with AI"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-500">
              This estimate is locked — the final quote has taken over under Formal proposals.
            </p>
          )}

          {selected.aiChat.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-[11px] text-zinc-400">
              {selected.aiChat.map((t, i) => (
                <p key={`${t.at}-${i}`} className="mt-1 whitespace-pre-wrap">
                  <span className="text-amber-400">{t.role}:</span> {t.content}
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}

      {flash ? (
        <p className={`text-xs ${flash.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
          {flash.message}
        </p>
      ) : null}
    </div>
  );
}
