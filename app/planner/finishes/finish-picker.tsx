"use client";

import { useState } from "react";
import {
  PAINT_COLORS,
  STAIN_COLORS,
  HARDWARE,
  SHEEN_LABELS,
  describeFinishSelection,
  type CustomerFinishSelection,
  type FinishSheen,
} from "@/lib/finish-hardware-catalog";
import { lu } from "@/lib/level-up-ui";

const SHEENS = Object.keys(SHEEN_LABELS) as FinishSheen[];

export function FinishPicker({ proposalId }: { proposalId: string }) {
  const [finishType, setFinishType] = useState<"paint" | "stain">("paint");
  const [paintId, setPaintId] = useState(PAINT_COLORS[0].id);
  const [stainId, setStainId] = useState(STAIN_COLORS[0].id);
  const [sheen, setSheen] = useState<FinishSheen>("satin");
  const [pullId, setPullId] = useState<string | undefined>(undefined);
  const [knobId, setKnobId] = useState<string | undefined>(undefined);
  const [slideId, setSlideId] = useState(HARDWARE.find((h) => h.category === "drawer-slide")?.id);
  const [hingeId, setHingeId] = useState(HARDWARE.find((h) => h.category === "hinge")?.id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pulls = HARDWARE.filter((h) => h.category === "bar-pull");
  const knobs = HARDWARE.filter((h) => h.category === "knob");
  const slides = HARDWARE.filter((h) => h.category === "drawer-slide");
  const hinges = HARDWARE.filter((h) => h.category === "hinge");

  const selection: CustomerFinishSelection = {
    finishType,
    paintColorId: finishType === "paint" ? paintId : undefined,
    stainColorId: finishType === "stain" ? stainId : undefined,
    sheen,
    pullId,
    knobId,
    drawerSlideId: slideId,
    hingeId,
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/finish-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, selection }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not save your finish selections.");
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Finish type */}
      <section className={lu.panel}>
        <h2 className={lu.heading}>Paint or stain?</h2>
        <div className="mt-4 flex gap-3">
          {(["paint", "stain"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFinishType(t)}
              className={`${lu.btnSecondary} ${finishType === t ? "!border-[#7c5cff] !bg-[#f0eaff]" : ""}`}
            >
              {t === "paint" ? "Painted" : "Stained wood"}
            </button>
          ))}
        </div>
      </section>

      {/* Color */}
      <section className={lu.panel}>
        <h2 className={lu.heading}>{finishType === "paint" ? "Paint color" : "Stain color"}</h2>
        <p className={`mt-1 ${lu.muted}`}>
          {finishType === "paint"
            ? "Real Benjamin Moore and Sherwin-Williams colors, mixed in cabinet-grade paint."
            : "Rubio Monocoat hardwax oil on white oak — the standard for natural wood finishes."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(finishType === "paint" ? PAINT_COLORS : STAIN_COLORS).map((c) => {
            const active = finishType === "paint" ? paintId === c.id : stainId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => (finishType === "paint" ? setPaintId(c.id) : setStainId(c.id))}
                className={`rounded-xl border-2 p-3 text-left transition ${
                  active ? "border-[#7c5cff] bg-[#f7f1ff]" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="h-12 w-full rounded-lg border border-gray-200" style={{ backgroundColor: c.hex }} />
                <div className="mt-2 text-[14px] font-semibold">{c.name}</div>
                <div className={`text-[12px] ${lu.muted}`}>
                  {"code" in c ? c.code : c.productLine} · {c.brand}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Sheen */}
      <section className={lu.panel}>
        <h2 className={lu.heading}>Sheen</h2>
        <p className={`mt-1 ${lu.muted}`}>How shiny the finish looks. Satin is the most popular for built-ins.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {SHEENS.map((s) => (
            <button
              key={s}
              onClick={() => setSheen(s)}
              className={`${lu.btnSecondary} ${sheen === s ? "!border-[#7c5cff] !bg-[#f0eaff]" : ""}`}
            >
              {SHEEN_LABELS[s]}
            </button>
          ))}
        </div>
      </section>

      {/* Hardware */}
      <section className={lu.panel}>
        <h2 className={lu.heading}>Hardware</h2>
        <p className={`mt-1 ${lu.muted}`}>Real products, sourced in Toronto. Prices confirmed before your proposal is finalized.</p>

        <h3 className="mt-6 text-[15px] font-semibold">Drawer / door pulls</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={() => setPullId(undefined)}
            className={`rounded-lg border p-3 text-left ${!pullId ? "border-[#7c5cff] bg-[#f7f1ff]" : "border-gray-200"}`}
          >
            <div className="text-[14px] font-medium">No pulls — clean fronts</div>
          </button>
          {pulls.map((p) => (
            <button
              key={p.id}
              onClick={() => setPullId(p.id)}
              className={`rounded-lg border p-3 text-left ${pullId === p.id ? "border-[#7c5cff] bg-[#f7f1ff]" : "border-gray-200"}`}
            >
              <div className="text-[14px] font-medium">{p.brand} {p.model}</div>
              <div className={`text-[12px] ${lu.muted}`}>{p.finish} · {p.sizeIn}&quot; · {p.whereToBuy[0]}</div>
            </button>
          ))}
        </div>

        <h3 className="mt-6 text-[15px] font-semibold">Knobs</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={() => setKnobId(undefined)}
            className={`rounded-lg border p-3 text-left ${!knobId ? "border-[#7c5cff] bg-[#f7f1ff]" : "border-gray-200"}`}
          >
            <div className="text-[14px] font-medium">No knobs</div>
          </button>
          {knobs.map((k) => (
            <button
              key={k.id}
              onClick={() => setKnobId(k.id)}
              className={`rounded-lg border p-3 text-left ${knobId === k.id ? "border-[#7c5cff] bg-[#f7f1ff]" : "border-gray-200"}`}
            >
              <div className="text-[14px] font-medium">{k.brand} {k.model}</div>
              <div className={`text-[12px] ${lu.muted}`}>{k.finish} · {k.whereToBuy[0]}</div>
            </button>
          ))}
        </div>

        <h3 className="mt-6 text-[15px] font-semibold">Drawer slides</h3>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {slides.map((s) => (
            <button
              key={s.id}
              onClick={() => setSlideId(s.id)}
              className={`rounded-lg border p-3 text-left ${slideId === s.id ? "border-[#7c5cff] bg-[#f7f1ff]" : "border-gray-200"}`}
            >
              <div className="text-[14px] font-medium">{s.brand} {s.model}</div>
              <div className={`text-[12px] ${lu.muted}`}>{s.notes}</div>
            </button>
          ))}
        </div>

        <h3 className="mt-6 text-[15px] font-semibold">Hinges</h3>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {hinges.map((h) => (
            <button
              key={h.id}
              onClick={() => setHingeId(h.id)}
              className={`rounded-lg border p-3 text-left ${hingeId === h.id ? "border-[#7c5cff] bg-[#f7f1ff]" : "border-gray-200"}`}
            >
              <div className="text-[14px] font-medium">{h.brand} {h.model}</div>
              <div className={`text-[12px] ${lu.muted}`}>{h.notes}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Summary + save */}
      <section className={lu.panel}>
        <h2 className={lu.heading}>Your selections</h2>
        <p className="mt-2 text-[15px]">{describeFinishSelection(selection)}</p>
        {error && <p className="mt-3 text-[14px] text-red-600">{error}</p>}
        {saved && <p className="mt-3 text-[14px] text-green-700">Saved — these finishes will be on your proposal.</p>}
        <button onClick={save} disabled={saving} className={`${lu.btnPrimary} mt-4`}>
          {saving ? "Saving…" : saved ? "Update selections" : "Save finish selections"}
        </button>
      </section>
    </div>
  );
}
