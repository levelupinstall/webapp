import { lu } from "@/lib/level-up-ui";

export default function ReviewsGallery() {
  return (
    <div className={lu.panel}>
      <p className={lu.eyebrow}>
        Why Level Up Install
      </p>
      <h2 className={`mt-2 ${lu.headingLg} text-[#2e1842]`}>
        New company. Experienced hands.
      </h2>
      <p className={`mt-3 max-w-2xl ${lu.body}`}>
        Level Up Install is new — so we&apos;re not borrowing reviews we didn&apos;t earn. What we
        bring is commercial installation experience on high-end retail stores, where the standard is
        exact measurements, invisible fasteners, and finishes that hold up under close inspection.
        The same precision, now focused on homes.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className={`${lu.featureTile} p-6`}>
          <p className="text-lg font-bold text-[#31184a]">Exact</p>
          <p className="mt-2 text-sm leading-relaxed text-[#55337b] sm:text-[15px]">
            Retail installs live or die on millimetre tolerances. Your shelves, miters, and
            reveals get the same treatment.
          </p>
        </div>
        <div className={`${lu.featureTile} p-6`}>
          <p className="text-lg font-bold text-[#31184a]">Clean</p>
          <p className="mt-2 text-sm leading-relaxed text-[#55337b] sm:text-[15px]">
            Tidy sites and careful prep — dust control, floor protection, and a walkthrough before
            you pay.
          </p>
        </div>
        <div className={`${lu.featureTile} p-6`}>
          <p className="text-lg font-bold text-[#31184a]">Accountable</p>
          <p className="mt-2 text-sm leading-relaxed text-[#55337b] sm:text-[15px]">
            Fixed written quotes, insured crews with WSIB coverage, and progress photos along
            the way.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-[#dcc6fb] bg-[#faf8ff] p-6 sm:p-7">
        <h3 className="text-lg font-semibold text-[#230f35] sm:text-xl">
          Be one of our first reviews
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#55337b] sm:text-[15px]">
          We&apos;re building our track record one install at a time. Book a project, and when the
          walkthrough&apos;s done, tell Toronto what you thought — we&apos;ll earn the stars.
        </p>
      </div>
    </div>
  );
}
