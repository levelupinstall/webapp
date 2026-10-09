import Link from "next/link";
import { FinishPicker } from "@/app/planner/finishes/finish-picker";
import { lu } from "@/lib/level-up-ui";

export default function FinishesPage({
  searchParams,
}: {
  searchParams: { proposal?: string };
}) {
  const proposalId = searchParams.proposal ?? "";
  return (
    <main className={`${lu.page} !max-w-3xl !pt-16`}>
      <h1 className={lu.headingLg}>Choose your finishes</h1>
      <p className={`mt-2 text-[16px] ${lu.body}`}>
        Your design is approved. Now pick the exact colors, sheen, and hardware —
        real products we source in Toronto. These go on your final proposal.
      </p>
      <div className="mt-8">
        {proposalId ? (
          <FinishPicker proposalId={proposalId} />
        ) : (
          <div className={lu.panel}>
            <p className={lu.body}>
              Submit your design from the planner first, then come back here to
              choose finishes.
            </p>
            <Link href="/?section=planner" className={`${lu.btnSecondary} mt-4 inline-block`}>
              Back to design tool
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
