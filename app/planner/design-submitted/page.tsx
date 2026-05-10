import Link from "next/link";

export default function DesignSubmittedPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-gradient-to-b from-[#f8f2ff] via-[#f2e9ff] to-[#ffffff] px-4 py-16 text-[#281437]">
      <div className="rounded-3xl border border-[#d9c2fa] bg-[#f7f1ff] p-8 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.35)]">
        <h1 className="text-3xl font-semibold text-[#2d1546]">Thank you for submitting your design</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[#55337b]">
          We&apos;ll review your conversation and visuals, then prepare a final proposal for your review.
          You&apos;ll hear from us when it&apos;s ready.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/?section=account&portalView=saved-projects"
            className="rounded-full bg-[#6e3eb2] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5b3292]"
          >
            Saved designs
          </Link>
          <Link
            href="/?section=planner"
            className="rounded-full border border-[#6e3eb2] bg-white px-5 py-3 text-sm font-semibold text-[#5b3292] transition hover:bg-[#f3ebff]"
          >
            Back to design tool
          </Link>
        </div>
        <p className="mt-6 text-sm text-[#6a4a8f]">
          Your design was saved to your portal, and our team received your submission for proposal creation.
        </p>
      </div>
    </main>
  );
}
