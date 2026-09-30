"use client";

import { useEffect, useState } from "react";

type RateCard = {
  laborRateCad: number;
  callOutFeeCad: number;
  procurementMarkupPct: number;
  defaultSubRateCad: number;
  includedLaborHours: number;
  carpentryMarginPct: number;
};

const FIELDS: Array<{
  key: keyof RateCard;
  label: string;
  hint: string;
  prefix?: string;
  suffix?: string;
}> = [
  {
    key: "laborRateCad",
    label: "Labour rate",
    hint: "Your sell rate per hour on quotes.",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "callOutFeeCad",
    label: "Call-out / site visit fee",
    hint: "Flat fee added to every estimate.",
    prefix: "$",
  },
  {
    key: "procurementMarkupPct",
    label: "Procurement markup",
    hint: "Markup on premade (buy) products you source.",
    suffix: "%",
  },
  {
    key: "defaultSubRateCad",
    label: "Default sub rate",
    hint: "What you usually pay a subcontractor per hour.",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "includedLaborHours",
    label: "Included labour hours",
    hint: "Hours covered by the call-out fee (legacy pricing holds).",
    suffix: "hrs",
  },
  {
    key: "carpentryMarginPct",
    label: "Carpentry margin",
    hint: "Target margin on custom work (legacy pricing holds).",
    suffix: "%",
  },
];

export function RateCardTab() {
  const [card, setCard] = useState<RateCard | null>(null);
  const [draft, setDraft] = useState<Record<keyof RateCard, string>>({
    laborRateCad: "",
    callOutFeeCad: "",
    procurementMarkupPct: "",
    defaultSubRateCad: "",
    includedLaborHours: "",
    carpentryMarginPct: "",
  });
  const [busy, setBusy] = useState<"load" | "save" | "">("load");
  const [flash, setFlash] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/rate-card")
      .then((r) => r.json())
      .then((j: { error?: string; rateCard?: RateCard }) => {
        if (cancelled) return;
        if (j.error || !j.rateCard) throw new Error(j.error || "Could not load the rate card.");
        const rc = j.rateCard;
        setCard(rc);
        setDraft({
          laborRateCad: String(rc.laborRateCad),
          callOutFeeCad: String(rc.callOutFeeCad),
          procurementMarkupPct: String(rc.procurementMarkupPct),
          defaultSubRateCad: String(rc.defaultSubRateCad),
          includedLaborHours: String(rc.includedLaborHours),
          carpentryMarginPct: String(rc.carpentryMarginPct),
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFlash({
            type: "err",
            message: e instanceof Error ? e.message : "Load failed.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setBusy("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setBusy("save");
    setFlash(null);
    try {
      const payload: Partial<RateCard> = {};
      for (const f of FIELDS) {
        const v = Number(draft[f.key]);
        if (!Number.isFinite(v) || v < 0) {
          throw new Error(`${f.label} must be a number ≥ 0.`);
        }
        payload[f.key] = v;
      }
      const res = await fetch("/api/admin/rate-card", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string; rateCard?: RateCard };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setCard(json.rateCard!);
      setFlash({ type: "ok", message: "Rate card saved — new estimates will use these rates." });
    } catch (e) {
      setFlash({ type: "err", message: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy("");
    }
  };

  const dirty =
    card !== null &&
    FIELDS.some((f) => Number(draft[f.key]) !== card[f.key]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-200">Rate card</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Your pricing inputs. The AI estimate engine uses these when drafting estimates —
          change a number here and the next estimate follows it. Existing estimates are
          never rewritten.
        </p>
      </div>

      {busy === "load" && !card ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <label
              key={f.key}
              className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
            >
              <span className="block text-[11px] font-semibold uppercase text-zinc-500">
                {f.label}
              </span>
              <span className="mt-1 flex items-center gap-1">
                {f.prefix ? <span className="text-xs text-zinc-500">{f.prefix}</span> : null}
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draft[f.key]}
                  disabled={busy !== ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
                />
                {f.suffix ? <span className="text-xs text-zinc-500">{f.suffix}</span> : null}
              </span>
              <span className="mt-1 block text-[11px] text-zinc-600">{f.hint}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy !== "" || !dirty}
          onClick={save}
          className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save rate card"}
        </button>
        {flash ? (
          <p className={`text-xs ${flash.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
            {flash.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
