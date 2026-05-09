import Link from "next/link";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function ProposalPaymentSuccessPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
      <div className="rounded-3xl border border-[#d9c2fa] bg-[#f7f1ff] p-8">
        <h1 className="text-3xl font-semibold text-[#2d1546]">Payment received</h1>
        <p className="mt-3 text-[#55337b]">
          Thank you. Your proposal payment is processing — you&apos;ll receive a confirmation from Stripe,
          and our team will follow up on scheduling.
        </p>
        {sessionId ? (
          <p className="mt-2 font-mono text-xs text-[#8b7aa8]">Reference: {sessionId}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full bg-[#6e3eb2] px-5 py-3 text-sm font-semibold text-white"
          >
            Return home
          </Link>
          <Link
            href="/?section=account&portalView=proposals"
            className="rounded-full border border-[#6e3eb2] px-5 py-3 text-sm font-semibold text-[#5b3292]"
          >
            My proposals
          </Link>
        </div>
      </div>
    </main>
  );
}
