import { Suspense } from "react";
import ProposalClient from "./proposal-client";

export default function ProposalPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
          <p className="text-[#55337b]">Loading…</p>
        </main>
      }
    >
      <ProposalClient />
    </Suspense>
  );
}
