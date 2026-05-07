function IllustrationBuiltIns() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" fill="none" aria-hidden>
      <rect width="320" height="200" fill="url(#rg-bi)" rx="12" />
      <defs>
        <linearGradient id="rg-bi" x1="0" y1="0" x2="320" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4eeff" />
          <stop offset="1" stopColor="#e4d9ff" />
        </linearGradient>
      </defs>
      <rect x="36" y="48" width="248" height="120" rx="8" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
      <rect x="52" y="64" width="72" height="88" rx="4" fill="#ede4ff" stroke="#b894e8" strokeWidth="1.5" />
      <rect x="136" y="64" width="72" height="88" rx="4" fill="#ede4ff" stroke="#b894e8" strokeWidth="1.5" opacity="0.85" />
      <rect x="220" y="64" width="48" height="88" rx="4" fill="#ede4ff" stroke="#b894e8" strokeWidth="1.5" opacity="0.65" />
      <path d="M56 108h64M56 124h56M56 140h60" stroke="#6e3eb2" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

function IllustrationTrim() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" fill="none" aria-hidden>
      <rect width="320" height="200" fill="url(#rg-tr)" rx="12" />
      <defs>
        <linearGradient id="rg-tr" x1="0" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fdfaff" />
          <stop offset="1" stopColor="#eadcff" />
        </linearGradient>
      </defs>
      <rect x="40" y="52" width="240" height="110" rx="6" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
      <path d="M48 72h224M48 96h224M48 120h224M48 144h224" stroke="#dcc6fb" strokeWidth="4" strokeLinecap="round" />
      <path d="M48 160 L160 68 L272 160" stroke="#6e3eb2" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <rect x="52" y="68" width="216" height="10" rx="2" fill="#ede4ff" opacity="0.6" />
    </svg>
  );
}

function IllustrationFeatureWall() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" fill="none" aria-hidden>
      <rect width="320" height="200" fill="url(#rg-fw)" rx="12" />
      <defs>
        <linearGradient id="rg-fw" x1="160" y1="0" x2="160" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8f4ff" />
          <stop offset="1" stopColor="#dfd5ff" />
        </linearGradient>
      </defs>
      <rect x="56" y="44" width="208" height="120" rx="8" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
      <rect x="76" y="64" width="168" height="80" rx="4" fill="#faf6ff" stroke="#6e3eb2" strokeWidth="1.5" opacity="0.5" />
      <rect x="96" y="84" width="48" height="40" rx="3" fill="#ede4ff" />
      <rect x="156" y="84" width="48" height="40" rx="3" fill="#ede4ff" opacity="0.75" />
      <rect x="216" y="84" width="28" height="40" rx="3" fill="#ede4ff" opacity="0.55" />
      <circle cx="248" cy="68" r="6" fill="#fbbf24" opacity="0.9" />
    </svg>
  );
}

function IllustrationStorage() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" fill="none" aria-hidden>
      <rect width="320" height="200" fill="url(#rg-st)" rx="12" />
      <defs>
        <linearGradient id="rg-st" x1="0" y1="100" x2="320" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fafbff" />
          <stop offset="1" stopColor="#ebe4ff" />
        </linearGradient>
      </defs>
      <rect x="48" y="56" width="224" height="100" rx="10" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
      <line x1="120" y1="56" x2="120" y2="156" stroke="#dcc6fb" strokeWidth="2" />
      <line x1="200" y1="56" x2="200" y2="156" stroke="#dcc6fb" strokeWidth="2" />
      <rect x="60" y="68" width="52" height="22" rx="3" fill="#ede4ff" />
      <rect x="132" y="68" width="60" height="22" rx="3" fill="#ede4ff" opacity="0.8" />
      <rect x="212" y="68" width="52" height="22" rx="3" fill="#ede4ff" opacity="0.65" />
      <circle cx="160" cy="118" r="16" fill="#6e3eb2" opacity="0.2" />
      <path d="M154 118 L158 122 L168 110" stroke="#6e3eb2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const REVIEWS = [
  {
    quote:
      "The built-ins look like they were always part of the house. Communication was clear and the site was left tidy every day.",
    author: "Sarah M.",
    location: "Greater Toronto Area",
    project: "Custom mudroom storage",
    Illustration: IllustrationBuiltIns,
  },
  {
    quote:
      "Trim and casing upgrades completely refreshed our main floor. They walked us through options before cutting anything.",
    author: "Daniel K.",
    location: "Toronto",
    project: "Whole-floor trim refresh",
    Illustration: IllustrationTrim,
  },
  {
    quote:
      "We had a tight alcove for a media wall. The crew measured carefully and the finished detail lines up perfectly.",
    author: "Priya R.",
    location: "Mississauga",
    project: "Media wall & shelving",
    Illustration: IllustrationFeatureWall,
  },
  {
    quote:
      "Bench seating plus overhead lockers turned our hallway into usable space. Booking through to install felt straightforward.",
    author: "Marcus T.",
    location: "Oakville",
    project: "Hallway bench & lockers",
    Illustration: IllustrationStorage,
  },
];

const GALLERY_ITEMS = [
  { label: "Shaker-style built-ins", Illustration: IllustrationBuiltIns },
  { label: "Crown & base upgrade", Illustration: IllustrationTrim },
  { label: "Feature wall & niche", Illustration: IllustrationFeatureWall },
  { label: "Entryway storage", Illustration: IllustrationStorage },
  { label: "Walk-in closet trim", Illustration: IllustrationTrim },
  { label: "Living room media unit", Illustration: IllustrationFeatureWall },
];

export default function ReviewsGallery() {
  return (
    <div className="rounded-3xl border border-[#e9d9ff] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.5)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
        Reviews &amp; gallery
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-[#2e1842] sm:text-3xl">
        Real projects. Happy homeowners.
      </h2>
      <p className="mt-3 max-w-2xl text-[#4d2e70]">
        Read what homeowners say about finish carpentry with Level Up Install, then scroll through
        sample job snapshots for the kinds of built-ins, trim, and feature walls we deliver. Ask us
        anytime for more photos from projects similar to yours.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {REVIEWS.map((item) => (
          <article
            key={item.author + item.project}
            className="flex flex-col overflow-hidden rounded-2xl border border-[#dcc6fb] bg-[#faf8ff] shadow-sm"
          >
            <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden border-b border-[#eddfff] bg-[#f5efff]">
              <item.Illustration />
              <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#5b3292] shadow">
                {item.project}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <blockquote className="text-[15px] leading-relaxed text-[#3c225d] sm:text-base">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <footer className="mt-4 border-t border-[#e8d9ff] pt-4 text-sm text-[#6a4a8f]">
                <span className="font-semibold text-[#31184a]">{item.author}</span>
                <span className="text-[#a08cbd]"> · </span>
                {item.location}
              </footer>
            </div>
          </article>
        ))}
      </div>

      <h3 className="mt-12 text-lg font-semibold text-[#230f35] sm:text-xl">
        Past work snapshots
      </h3>
      <p className="mt-2 text-sm text-[#55337b]">
        Representative styles we&apos;ve installed—your install photos can live here on the live site.
      </p>
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {GALLERY_ITEMS.map((tile, idx) => (
          <li
            key={`${tile.label}-${idx}`}
            className="overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_22px_-18px_rgba(91,33,182,0.4)]"
          >
            <div className="aspect-[4/3] w-full">
              <tile.Illustration />
            </div>
            <p className="border-t border-[#f0e8ff] px-3 py-2 text-center text-xs font-medium text-[#4d2e70]">
              {tile.label}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
