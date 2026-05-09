import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thanks for signing up — Level Up Install",
  description:
    "Confirm your email to activate your Level Up Install client portal account.",
};

type Props = {
  searchParams: Promise<{ channel?: string; hint?: string }>;
};

export default async function PortalSignupPendingPage({ searchParams }: Props) {
  const { channel, hint } = await searchParams;
  const isSms = channel === "sms";
  const safeHint = hint?.trim();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f2ff] via-[#f2e9ff] to-[#ffffff] px-4 py-16 text-[#281437] sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Image
            src="/level-up-install-logo.png"
            alt="Level Up Install"
            width={480}
            height={160}
            className="h-auto w-full max-w-[280px] object-contain"
            priority
          />
        </div>

        <div className="rounded-3xl border border-[#dac6fb] bg-white p-8 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-10">
          <h1 className="text-2xl font-semibold text-[#2d1546] sm:text-3xl">
            Thank you for creating your account
          </h1>

          <p className="mt-4 text-base leading-relaxed text-[#55337b]">
            We are glad you joined the Level Up Install client portal. One quick step remains before
            you can sign in.
          </p>

          {isSms ? (
            <p className="mt-4 text-base leading-relaxed text-[#4d2e70]">
              You will receive a <strong>text message</strong>
              {safeHint ? (
                <>
                  {" "}
                  at <span className="font-semibold text-[#2f1748]">{safeHint}</span>
                </>
              ) : null}{" "}
              with a verification code. Enter that code on the site where you registered to finish
              activating your account.
            </p>
          ) : (
            <p className="mt-4 text-base leading-relaxed text-[#4d2e70]">
              You will receive an <strong>email</strong>
              {safeHint ? (
                <>
                  {" "}
                  at <span className="font-semibold text-[#2f1748]">{safeHint}</span>
                </>
              ) : null}{" "}
              with a link to confirm your address and complete activation. Click the button in that
              email once — you will be signed in automatically.
            </p>
          )}

          <p className="mt-4 text-sm leading-relaxed text-[#6a4a8f]">
            {isSms
              ? "If nothing arrives within a few minutes, check your signal and try registering again, or contact us."
              : "If you do not see the message within a few minutes, check your spam or promotions folder. The link is valid for 24 hours."}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/?section=account"
              className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292]"
            >
              Back to sign in
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-[#6e3eb2] px-6 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f3ebff]"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
