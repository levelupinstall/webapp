import Link from "next/link";

import { DesignSubmittedStatus } from "@/app/planner/design-submitted/design-submitted-status";
import { lu } from "@/lib/level-up-ui";

export default function DesignSubmittedPage() {
  return (
    <main className={`${lu.page} !max-w-3xl !pt-16`}>
      <div className={`${lu.panel} bg-[#f7f1ff]`}>
        <h1 className={lu.headingLg}>Thank you for submitting your design</h1>
        <p className={`mt-4 text-[17px] ${lu.body}`}>
          We&apos;ll review your conversation and visuals, then prepare a final proposal for your review.
          You&apos;ll hear from us when it&apos;s ready.
        </p>
        <DesignSubmittedStatus />
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
