import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionFromCookie } from "@/lib/client-portal-auth";

export const metadata: Metadata = {
  title: "Your account is active — Level Up Install",
  description:
    "Your Level Up Install client portal is ready. Start planning your project with the AI planner.",
};

export default async function PortalWelcomeAfterVerificationPage() {
  const session = await getSessionFromCookie();
  if (!session) {
    redirect("/?section=account");
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

        <div className="rounded-3xl border border-[#c9e8c9] bg-[#f8fcf8] p-8 shadow-[0_10px_30px_-20px_rgba(47,122,50,0.2)] sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#2f7a32]">
            You are signed in
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[#2d1546] sm:text-3xl">
            Your account is active
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#55337b]">
            Thanks for confirming your email. Your Level Up Install client portal is ready—you are
            logged in as <span className="font-semibold text-[#2f1748]">{session.username}</span>.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[#4d2e70]">
            Next, open the{" "}
            <strong className="text-[#2f1748]">AI project planner</strong> to describe your space and
            goals in plain language. It helps you explore finish carpentry ideas and builds a brief you
            can save and revisit anytime.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/?section=planner"
              className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292]"
            >
              Open AI planner
            </Link>
            <Link
              href="/?section=account"
              className="inline-flex items-center justify-center rounded-full border border-[#6e3eb2] px-6 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f3ebff]"
              >
              Client portal
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-transparent px-6 py-3 text-sm font-semibold text-[#6a4a8f] underline-offset-4 hover:underline sm:border-[#dcc6fb]"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
