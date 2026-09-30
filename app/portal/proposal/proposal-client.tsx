"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { simpleMarkdownToSafeHtml } from "@/lib/simple-markdown-to-html";

type ChangeOrderPayload = {
  id: string;
  title: string;
  description: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitCostCad: number;
    totalCad: number;
  }>;
  totalCad: number;
  status: "proposed" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

type ProposalPayload = {
  title: string;
  markdownBody: string;
  termsMarkdown: string;
  status: string;
  paymentAmountCents: number;
  renderings: Array<{ id: string; dataUrl: string; caption?: string }>;
  changeOrders: ChangeOrderPayload[];
};

function cadMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

export default function ProposalClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const checkoutKind =
    searchParams.get("checkout_kind")?.trim() || searchParams.get("checkout")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProposalPayload | null>(null);

  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coBusyId, setCoBusyId] = useState<string | null>(null);
  const [coSignerName, setCoSignerName] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("Missing link token.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/work-proposal?t=${encodeURIComponent(token)}`);
      const json = (await res.json()) as { error?: string } & Partial<ProposalPayload>;
      if (!res.ok) {
        setError(json.error || "Could not load proposal.");
        setData(null);
        return;
      }
      setData(json as ProposalPayload);
    } catch {
      setError("Could not load proposal.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function acceptAndPay() {
    if (!token || !data) return;
    setBusy(true);
    setError(null);
    try {
      const acc = await fetch("/api/public/work-proposal/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signerName: signerName.trim(),
          agreedTerms: agreed,
        }),
      });
      const accJson = (await acc.json()) as { error?: string };
      if (!acc.ok) {
        setError(accJson.error || "Acceptance failed.");
        setBusy(false);
        return;
      }

      const pay = await fetch("/api/public/work-proposal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payJson = (await pay.json()) as { error?: string; url?: string };
      if (!pay.ok || !payJson.url) {
        setError(payJson.error || "Could not start checkout.");
        setBusy(false);
        return;
      }
      window.location.href = payJson.url;
    } catch {
      setError("Something went wrong.");
      setBusy(false);
    }
  }

  async function payOnly() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const pay = await fetch("/api/public/work-proposal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payJson = (await pay.json()) as { error?: string; url?: string };
      if (!pay.ok || !payJson.url) {
        setError(payJson.error || "Could not start checkout.");
        setBusy(false);
        return;
      }
      window.location.href = payJson.url;
    } catch {
      setError("Something went wrong.");
      setBusy(false);
    }
  }

  async function decideChangeOrder(changeOrderId: string, decision: "approved" | "rejected") {
    if (!token || coBusyId) return;
    setCoBusyId(changeOrderId);
    setError(null);
    try {
      const res = await fetch("/api/public/work-proposal/change-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          changeOrderId,
          decision,
          signerName: coSignerName.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not record your decision.");
        return;
      }
      await load();
    } catch {
      setError("Something went wrong.");
    } finally {
      setCoBusyId(null);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
        <p className="text-[#55337b]">This link is invalid.</p>
        <Link href="/" className="mt-4 inline-block text-[#6e3eb2] underline">
          Home
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
        <p className="text-[#55337b]">Loading proposal…</p>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <p>{error}</p>
        </div>
        <Link href="/" className="mt-4 inline-block text-[#6e3eb2] underline">
          Home
        </Link>
      </main>
    );
  }

  if (!data) return null;

  const paymentReturnBanner =
    checkoutKind === "immediate_ok"
      ? "Payment received — thank you. Your call-out fee and materials deposit are on file."
      : checkoutKind === "labor_hold_ok"
        ? "Labor authorization hold is in place — thanks."
        : checkoutKind === "cancelled" || checkoutKind === "labor_cancelled"
          ? "Checkout was cancelled. Use the secure links in this proposal when you're ready."
          : null;

  const showPayOnly = data.status === "accepted_pending_payment";
  const paid = data.status === "paid";

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
      <div className="proposal-print-root rounded-3xl border border-[#e9d9ff] bg-white p-6 shadow-sm sm:p-10">
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#ecdefe] pb-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-[#6e3eb2] bg-white px-5 py-2 text-sm font-semibold text-[#5b3292] hover:bg-[#f5efff]"
          >
            Print / Save as PDF
          </button>
          <Link
            href="/?section=account&portalView=proposals"
            className="text-sm font-semibold text-[#6e3eb2] underline"
          >
            Client portal — Proposals
          </Link>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-[#6e3eb2]">
          Level Up Install — formal proposal
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[#2d1546]">{data.title}</h1>
        <p className="mt-2 text-sm text-[#55337b]">
          Amount due after acceptance:{" "}
          <span className="font-semibold text-[#2d1546]">
            {cadMoney(
              data.paymentAmountCents +
                data.changeOrders
                  .filter((c) => c.status === "approved")
                  .reduce((s, c) => s + c.totalCad, 0) * 100,
            )}
          </span>
          {data.changeOrders.some((c) => c.status === "approved") ? (
            <span className="text-[#8b7aa8]">
              {" "}
              (includes approved change orders)
            </span>
          ) : null}
        </p>

        {paymentReturnBanner ? (
          <p className="mt-4 rounded-2xl border border-[#cbb6ee] bg-[#f7f1ff] px-4 py-3 text-sm text-[#442866]">
            {paymentReturnBanner}
          </p>
        ) : null}

        {data.renderings.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-[#2d1546]">Concept visuals</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {data.renderings.map((r) => (
                <figure key={r.id} className="overflow-hidden rounded-2xl border border-[#ecdefe]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- proposal renderings are data URLs */}
                  <img
                    src={r.dataUrl}
                    alt={r.caption || "Rendering"}
                    className="max-h-64 w-full object-contain bg-[#fcf9ff]"
                  />
                  {r.caption ? (
                    <figcaption className="px-3 py-2 text-xs text-[#55337b]">{r.caption}</figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        <article
          className="proposal-body mt-10 space-y-4 text-[#32174f] [&_.proposal-h2]:mt-8 [&_.proposal-h2]:text-xl [&_.proposal-h2]:font-semibold [&_.proposal-h3]:mt-4 [&_.proposal-h3]:text-base [&_.proposal-h3]:font-semibold [&_.proposal-p]:leading-relaxed [&_.proposal-ul]:list-disc [&_.proposal-ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: simpleMarkdownToSafeHtml(data.markdownBody) }}
        />

        <hr className="my-10 border-[#ecdefe]" />

        <section>
          <h2 className="text-lg font-semibold text-[#2d1546]">Terms</h2>
          <article
            className="proposal-body mt-3 space-y-4 text-sm text-[#55337b] [&_.proposal-h2]:mt-6 [&_.proposal-h2]:text-base [&_.proposal-h2]:font-semibold [&_.proposal-h3]:mt-3 [&_.proposal-h3]:text-sm [&_.proposal-h3]:font-semibold [&_.proposal-p]:leading-relaxed [&_.proposal-ul]:list-disc [&_.proposal-ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: simpleMarkdownToSafeHtml(data.termsMarkdown) }}
          />
        </section>

        {data.changeOrders.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-[#2d1546]">Change orders</h2>
            <p className="mt-1 text-sm text-[#55337b]">
              Extra work found on site, outside the approved scope. Nothing below is charged
              unless you approve it.
            </p>
            <div className="mt-4 space-y-4">
              {data.changeOrders.map((co) => (
                <div
                  key={co.id}
                  className="rounded-2xl border border-[#e9d9ff] bg-[#fcf9ff] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-[#2d1546]">{co.title}</h3>
                      {co.description ? (
                        <p className="mt-1 text-sm text-[#55337b]">{co.description}</p>
                      ) : null}
                    </div>
                    <span
                      className={
                        co.status === "approved"
                          ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
                          : co.status === "rejected"
                            ? "rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600"
                            : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
                      }
                    >
                      {co.status === "approved"
                        ? "Approved"
                        : co.status === "rejected"
                          ? "Declined"
                          : "Awaiting your approval"}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-[#32174f]">
                    {co.lineItems.map((li, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3">
                        <span>
                          {li.description}
                          <span className="text-[#8b7aa8]">
                            {" "}
                            · {li.quantity} {li.unit} @ {cadMoney(li.unitCostCad * 100)}
                          </span>
                        </span>
                        <span className="font-medium">{cadMoney(li.totalCad * 100)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-[#ecdefe] pt-3 text-right text-sm font-semibold text-[#2d1546]">
                    Change order total: {cadMoney(co.totalCad * 100)}
                  </p>
                  {co.status === "approved" && co.decidedBy ? (
                    <p className="mt-2 text-xs text-emerald-800">
                      Approved by {co.decidedBy}
                      {co.decidedAt
                        ? ` on ${new Date(co.decidedAt).toLocaleDateString("en-CA")}`
                        : ""}
                      . This amount is added to your project balance.
                    </p>
                  ) : null}
                  {co.status === "proposed" ? (
                    <div className="no-print mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <label className="block text-sm font-medium text-[#2d1546]">
                        Your name (electronic approval)
                        <input
                          value={coSignerName}
                          onChange={(e) => setCoSignerName(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[#dcbef9] bg-white px-4 py-2 text-[#32174f]"
                          placeholder="Your name"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={coBusyId === co.id}
                          onClick={() => void decideChangeOrder(co.id, "approved")}
                          className="rounded-full bg-[#6e3eb2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#5b3292] disabled:opacity-60"
                        >
                          {coBusyId === co.id ? "Saving…" : `Approve ${cadMoney(co.totalCad * 100)}`}
                        </button>
                        <button
                          type="button"
                          disabled={coBusyId === co.id}
                          onClick={() => void decideChangeOrder(co.id, "rejected")}
                          className="rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {data.changeOrders.some((c) => c.status === "approved") ? (
              <p className="mt-4 rounded-xl border border-[#cbb6ee] bg-[#f7f1ff] px-4 py-3 text-sm text-[#442866]">
                Approved change orders add{" "}
                <span className="font-semibold">
                  {cadMoney(
                    data.changeOrders
                      .filter((c) => c.status === "approved")
                      .reduce((s, c) => s + c.totalCad, 0) * 100,
                  )}
                </span>{" "}
                to your project balance, on top of the original proposal amount.
              </p>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <p className="no-print mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
        ) : null}

        {paid ? (
          <p className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            This proposal is paid. Thank you — our team will follow up on scheduling.
          </p>
        ) : showPayOnly ? (
          <div className="no-print mt-8 space-y-4">
            <p className="text-sm text-[#55337b]">
              You&apos;ve accepted this proposal. Continue to secure payment.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void payOnly()}
              className="rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#5b3292] disabled:opacity-60"
            >
              {busy ? "Redirecting…" : `Pay ${cadMoney(data.paymentAmountCents)} with Stripe`}
            </button>
          </div>
        ) : (
          <div className="no-print mt-8 space-y-4 rounded-2xl border border-[#ecdefe] bg-[#fcf9ff] p-5">
            <label className="block text-sm font-medium text-[#2d1546]">
              Full name (electronic acceptance)
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-4 py-2 text-[#32174f]"
                placeholder="Your name"
              />
            </label>
            <label className="flex items-start gap-2 text-sm text-[#55337b]">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1"
              />
              <span>I have read this proposal and agree to the terms above.</span>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void acceptAndPay()}
              className="rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#5b3292] disabled:opacity-60"
            >
              {busy ? "Continue…" : "Accept & pay with Stripe"}
            </button>
          </div>
        )}

        <p className="no-print mt-10 text-center text-sm text-[#8b7aa8]">
          <Link href="/" className="underline">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
