"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function CarpenterResetPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!tokenFromUrl) {
      setError("Missing reset token. Open the link from your email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/carpenter/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenFromUrl, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not reset password.");
      }
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f2ff] via-[#f2e9ff] to-[#ffffff] px-4 py-16 text-[#281437] sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Image
            src="/level-up-install-logo.jpg"
            alt="Level Up Install"
            width={480}
            height={160}
            className="h-auto w-full max-w-[280px] object-contain"
            priority
          />
        </div>

        <div className="rounded-3xl border border-[#dac6fb] bg-white p-8 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-10">
          <h1 className="text-2xl font-semibold text-[#2d1546] sm:text-3xl">
            Reset carpenter password
          </h1>
          <p className="mt-3 text-[#55337b]">
            Choose a new password for your carpenter account. If you did not request this, close this
            page.
          </p>

          {done ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm font-medium text-[#2f7a32]">
                Your password has been updated. You can log in with your new password.
              </p>
              <button
                type="button"
                onClick={() => router.push("/carpenter")}
                className="rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292]"
              >
                Go to carpenter login
              </button>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {!tokenFromUrl ? (
                <p className="text-sm text-[#a2175d]">
                  This page needs a valid link from your reset email. Request a new link from the
                  carpenter login page.
                </p>
              ) : null}
              <label className="block">
                <span className="text-sm font-semibold text-[#4a2381]">New password</span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[#4a2381]">Confirm password</span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f]"
                />
              </label>
              {error ? <p className="text-sm text-[#a2175d]">{error}</p> : null}
              <button
                type="submit"
                disabled={busy || !tokenFromUrl}
                className="rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-sm text-[#6a4a8f]">
            <Link href="/carpenter" className="font-semibold text-[#5b3292] underline">
              Back to carpenter app
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function CarpenterResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#faf6ff] text-[#55337b]">
          Loading…
        </main>
      }
    >
      <CarpenterResetPasswordInner />
    </Suspense>
  );
}
