import Link from "next/link";

import { DesignSubmittedStatus } from "@/app/planner/design-submitted/design-submitted-status";
import { lu } from "@/lib/level-up-ui";

export default function DesignSubmittedPage({
  searchParams,
}: {
  searchParams: { proposal?: string };
}) {
  const proposalId = searchParams.proposal?.trim() ?? "";
  return (
    <main className={`${lu.page} !max-w-3xl !pt-16`}>
      <div className={`${lu.panel} bg-[#f7f1ff]`}>
        <h1 className={lu.headingLg}>Thank you for submitting your design</h1>
        <p className={`mt-4 text-[17px] ${lu.body}`}>
          We&apos;ll review your conversation and visuals, then prepare a final proposal for your review.
          You&apos;ll hear from us when it&apos;s ready.
        </p>
        <DesignSubmittedStatus />
        {proposalId && (
          <div className="mt-6 rounded-xl border-2 border-[#7c5cff] bg-white p-5">
            <h2 className="text-[17px] font-semibold">Next step: choose your finishes</h2>
            <p className={`mt-1 text-[15px] ${lu.body}`}>
              Pick your exact paint or stain color, sheen, and hardware — real products
              we source in Toronto. Your selections go on the final proposal.
            </p>
            <Link
              href={`/planner/finishes?proposal=${encodeURIComponent(proposalId)}`}
              className={`${lu.btnPrimary} mt-4 inline-block`}
            >
              Choose finishes
            </Link>
          </div>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/?section=account&portalView=saved-projects"
            className={lu.btnPrimary}
          >
            Saved designs
          </Link>
          <Link
            href="/?section=planner"
            className={lu.btnSecondary}
          >
            Back to design tool
          </Link>
        </div>
        <p className={`mt-6 ${lu.muted}`}>
          Your design was saved to your portal, and our team received your submission for proposal creation.
        </p>
      </div>
    </main>
  );
}
