"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildJobCompletionCaption,
  truncateForTwitterIntent,
  type JobCompletionSocialInput,
} from "@/lib/admin-job-completion-social";

export type JobCompletionSocialPanelProps = {
  carpenterId: string;
  job: JobCompletionSocialInput & { id: string; status: string };
  facebookConfigured: boolean;
  siteUrl?: string;
  brandName: string;
};

export function JobCompletionSocialPanel({
  carpenterId,
  job,
  facebookConfigured,
  siteUrl,
  brandName,
}: JobCompletionSocialPanelProps) {
  if (job.status !== "completed") return null;

  const baseline = useMemo(
    () =>
      buildJobCompletionCaption(
        {
          title: job.title,
          startDate: job.startDate,
          clientName: job.clientName,
          carpenterUsername: job.carpenterUsername,
          carpenterFullName: job.carpenterFullName,
        },
        brandName,
      ),
    [job, brandName],
  );

  const [draft, setDraft] = useState(baseline);
  useEffect(() => {
    setDraft(baseline);
  }, [baseline]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [lastPostUrl, setLastPostUrl] = useState<string | null>(null);

  async function publishFacebook() {
    setMsg(null);
    setLastPostUrl(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/social/post-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carpenterId,
          jobId: job.id,
          message: draft,
          publishFacebook: true,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        facebookPermalink?: string;
      };
      if (!res.ok) {
        setMsg({
          type: "err",
          text: typeof data.error === "string" ? data.error : "Could not post to Facebook.",
        });
        return;
      }
      setMsg({ type: "ok", text: "Published to your Facebook Page." });
      if (typeof data.facebookPermalink === "string") setLastPostUrl(data.facebookPermalink);
    } finally {
      setBusy(false);
    }
  }

  function openXCompose() {
    const text = truncateForTwitterIntent(draft);
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openLinkedInShare() {
    const url = siteUrl?.trim();
    const target = url
      ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
      : "https://www.linkedin.com/feed/";
    window.open(target, "_blank", "noopener,noreferrer");
  }

  async function copyCaption() {
    setMsg(null);
    try {
      await navigator.clipboard.writeText(draft);
      setMsg({ type: "ok", text: "Caption copied — paste into Instagram or other apps." });
    } catch {
      setMsg({ type: "err", text: "Clipboard unavailable; select and copy manually." });
    }
  }

  return (
    <div className="rounded-lg border border-violet-900/40 bg-violet-950/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-300">
            Share job completion
          </h4>
          <p className="mt-1 max-w-xl text-xs text-zinc-500">
            Edit the caption, then post to your Facebook Page in one click (Meta Graph API), or open X /
            LinkedIn helpers. Instagram does not allow plain-text API posts here — use Copy and paste in
            the app.
          </p>
        </div>
        {!facebookConfigured ? (
          <span className="rounded-full border border-amber-800/80 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200/90">
            Facebook API not configured
          </span>
        ) : (
          <span className="rounded-full border border-emerald-900/80 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
            Facebook Page ready
          </span>
        )}
      </div>

      <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Post caption
      </label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        className="mt-1 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !facebookConfigured}
          onClick={() => void publishFacebook()}
          className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post to Facebook Page"}
        </button>
        <button
          type="button"
          onClick={openXCompose}
          className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white"
        >
          Open X compose
        </button>
        <button
          type="button"
          onClick={openLinkedInShare}
          className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white"
        >
          LinkedIn share
        </button>
        <button
          type="button"
          onClick={() => void copyCaption()}
          className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white"
        >
          Copy caption
        </button>
      </div>

      {msg ? (
        <p
          className={`mt-2 text-xs ${msg.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}
          role="status"
        >
          {msg.text}
        </p>
      ) : null}
      {lastPostUrl ? (
        <p className="mt-1 text-xs">
          <a
            href={lastPostUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 underline hover:text-violet-300"
          >
            View Facebook post
          </a>
        </p>
      ) : null}
    </div>
  );
}
