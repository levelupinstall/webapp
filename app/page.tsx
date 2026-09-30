"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ClientPortal from "./components/client-portal";
import ProjectPlannerAssistant from "./components/project-planner-assistant";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import ReviewsGallery from "./components/reviews-gallery";
import { lu, luSectionTab } from "@/lib/level-up-ui";

type SectionKey = "overview" | "reviews" | "rates" | "planner" | "account";
type AccountMenuView = "saved-projects" | "proposals" | "invoices" | "profile" | "bookings";
type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
};

function portalWelcomeName(user: AuthUser): string {
  return user.fullName?.trim() || user.email?.trim() || user.username;
}

function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [portalMode, setPortalMode] = useState<"login" | "register">("login");
  const [accountView, setAccountView] = useState<AccountMenuView>("saved-projects");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchParams = useSearchParams();
  const querySection = searchParams.get("section");
  const queryPortalView = searchParams.get("portalView");
  const currentSection: SectionKey =
    querySection === "overview" ||
    querySection === "reviews" ||
    querySection === "rates" ||
    querySection === "planner" ||
    querySection === "account"
      ? querySection
      : activeSection;

  /** Section tabs must update the URL — `currentSection` prefers `?section=` over React state (e.g. after login). */
  function navigateToSection(section: SectionKey) {
    setActiveSection(section);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    async function loadAuthState() {
      const response = await fetch("/api/portal/me");
      if (!response.ok) {
        setAuthUser(null);
        return;
      }
      const data = (await response.json()) as {
        user: { id: string; username: string; fullName: string; email: string };
      };
      setAuthUser({
        id: data.user.id,
        username: data.user.username,
        fullName: data.user.fullName,
        email: data.user.email ?? "",
      });
    }
    void loadAuthState();
  }, []);

  useEffect(() => {
    const view = queryPortalView?.trim().toLowerCase();
    if (
      view !== "invoices" &&
      view !== "proposals" &&
      view !== "saved-projects"
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (view === "invoices") setAccountView("invoices");
      if (view === "proposals") setAccountView("proposals");
      if (view === "saved-projects") setAccountView("saved-projects");
      navigateToSection("account");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queryPortalView]);

  function openAuth(mode: "login" | "register") {
    setPortalMode(mode);
    navigateToSection("account");
    setMenuOpen(false);
  }

  function openAccountView(view: AccountMenuView) {
    setAccountView(view);
    navigateToSection("account");
    setMenuOpen(false);
  }

  async function handleHeaderLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    setAuthUser(null);
    navigateToSection("overview");
    setMenuOpen(false);
  }

  const sectionButtonClass = (section: SectionKey) =>
    luSectionTab(currentSection === section);

  return (
    <main className={lu.page}>
      <div className={lu.nav}>
        <div className={lu.navInner}>
          <a
            href="#"
            className="flex w-[30%] min-w-[104px] max-w-[320px] shrink-0 items-center justify-start py-0.5 sm:py-1"
          >
            <Image
              src="/level-up-install-logo.jpg"
              alt="Level Up Install logo"
              width={1024}
              height={576}
              className="h-auto w-full max-h-[76px] rounded-xl object-contain object-left sm:max-h-[92px] md:max-h-[104px]"
              priority
            />
          </a>
          {authUser ? (
            <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
              <p className="text-xs font-semibold text-[#5b3292] sm:text-sm">
                {portalWelcomeName(authUser)}
              </p>
              <button
                type="button"
                onClick={handleHeaderLogout}
                className={lu.btnSecondary}
              >
                Log Out
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className={`${lu.btnPrimary} !px-3 !py-2 sm:!px-4`}
              >
                Menu
              </button>
              {menuOpen ? (
                <div className={lu.navMenu}>
                  <button
                    type="button"
                    onClick={() => openAccountView("saved-projects")}
                    className={lu.navMenuItem}
                  >
                    Saved Designs
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountView("proposals")}
                    className={lu.navMenuItem}
                  >
                    Proposals
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountView("invoices")}
                    className={lu.navMenuItem}
                  >
                    Invoices
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountView("profile")}
                    className={lu.navMenuItem}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountView("bookings")}
                    className={lu.navMenuItem}
                  >
                    Bookings
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => navigateToSection("planner")}
                className={`${lu.btnPrimary} !px-4 !py-2 sm:!px-5`}
              >
                Get a Free Quote
              </button>
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="text-sm font-semibold text-[#5b3292] underline-offset-4 hover:underline"
              >
                Log in
              </button>
            </div>
          )}
        </div>
      </div>
      <section className={lu.container}>
        <div className={`${lu.tabsBar} mb-6`}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigateToSection("overview")}
              className={sectionButtonClass("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => navigateToSection("reviews")}
              className={sectionButtonClass("reviews")}
            >
              Why Us
            </button>
            <button
              type="button"
              onClick={() => navigateToSection("rates")}
              className={sectionButtonClass("rates")}
            >
              Rates
            </button>
            <button
              type="button"
              onClick={() => navigateToSection("planner")}
              className={sectionButtonClass("planner")}
            >
              Planner
            </button>
            <button
              type="button"
              onClick={() => {
                if (authUser) {
                  openAccountView("saved-projects");
                } else {
                  openAuth("login");
                }
              }}
              className={lu.btnSecondary}
            >
              Saved Designs
            </button>
          </div>
        </div>

        {currentSection === "overview" ? (
          <div className={lu.card}>
            <div className="mb-8 overflow-hidden rounded-3xl border border-[#e6d7ff] bg-gradient-to-br from-[#ffffff] via-[#faf6ff] to-[#f0e8ff] shadow-[0_16px_48px_-24px_rgba(91,33,182,0.45)]">
              <div className="grid gap-6 p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                    Finish carpenter · Toronto &amp; the GTA
                  </p>
                  <h1 className="mt-3 text-3xl font-bold leading-tight text-[#230f35] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
                    Toronto Finish Carpentry, Designed Around Your Space
                  </h1>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-[#4d2e70] sm:text-lg">
                    Shelving, built-ins, trim, and wall upgrades — see your room redesigned by AI
                    before we lift a hammer. $150 call-out, $75/hr, upfront fixed quotes.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => navigateToSection("planner")}
                      className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-8 py-4 text-base font-semibold text-white shadow-[0_12px_30px_-10px_rgba(110,62,178,0.9)] transition hover:-translate-y-0.5 hover:bg-[#5b3292] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6e3eb2]"
                    >
                      See My Space Redesigned — Free
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToSection("planner")}
                      className="inline-flex items-center justify-center rounded-full border-2 border-[#6e3eb2] bg-white px-8 py-4 text-base font-semibold text-[#5b3292] transition hover:bg-[#f5efff]"
                    >
                      Get a Fixed Quote
                    </button>
                  </div>
                  <p className="mt-4 text-xs text-[#6a4a8f] sm:text-sm">
                    Insured &amp; WSIB-covered · Serving Toronto &amp; the GTA · No-obligation quotes
                  </p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-[#e6d7ff] bg-white shadow-[0_8px_24px_-16px_rgba(91,33,182,0.6)]">
                  <Image
                    src="/hero-ai-render.jpg"
                    alt="AI-generated concept of dark walnut floating shelves in a living room"
                    width={1024}
                    height={768}
                    className="h-auto w-full object-cover"
                    priority
                  />
                  <p className="px-4 py-2.5 text-[11px] leading-snug text-[#6a4a8f] sm:text-xs">
                    AI concept visual — upload a photo of your own room to see it redesigned free.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf8ff] p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                What we do
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#230f35] sm:text-2xl">
                Finish carpentry for the details that make a room feel done
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                From floating shelves to full feature walls — here&apos;s what Toronto homeowners book
                us for most. If it&apos;s on your list, we&apos;ll confirm feasibility and timing when
                we scope the job.
              </p>
              <ul className="mt-6 grid gap-3 text-sm leading-relaxed text-[#55337b] sm:grid-cols-2 sm:gap-x-8 sm:text-[15px]">
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Pictures &amp; wall décor —</span>{" "}
                    Gallery walls, mirrors, and art hung level and secure on any wall type — plus
                    curtain rods, hooks, and house numbers.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Shelving —</span> Floating
                    shelves, bracketed units, and closet systems installed level and anchored to last —
                    including IKEA assemblies.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">IKEA &amp; flat-pack furniture —</span>{" "}
                    Bookcases, wardrobes, desks, and storage built square, leveled, and wall-anchored
                    where safety calls for it.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Cabinets —</span> Wall and base
                    cabinet installs with filler panels, scribes, and hardware dialed in around your
                    appliances.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Trim &amp; moulding —</span>{" "}
                    Baseboard, casing, and crown installed tight, with clean miters and returns.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Doors —</span> Prehung interior door
                    installs and slab replacement, with hardware and clearances set right.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">TV mounting —</span> Flat-panel TVs on
                    tilt, full-motion, or fixed mounts — load-rated and set at the right height for the room.
                  </span>
                </li>
              </ul>
              <p className="mt-6 text-sm text-[#6a4a8f]">
                Bigger renovations or trades outside carpentry? We&apos;ll flag them after the site
                visit and help you line up the right partner. Commercial general liability insurance and
                WSIB coverage on every job — ask if your building needs a certificate.
              </p>
            </div>

            <div className="mt-10 rounded-2xl border border-[#e8d9ff] bg-[#faf8ff] p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                Free AI design consult
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#230f35] sm:text-2xl">
                Upload a photo. See your room redesigned in minutes.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                {PLANNER_ASSISTANT_NAME}, our planning consultant, chats through your space and goals,
                then generates <span className="font-semibold text-[#31184a]">concept visuals</span> so you
                can see directions before committing. No pricing or product talk in that chat — just ideas.
                When you love a direction, we review your designs and send a{" "}
                <span className="font-semibold text-[#31184a]">detailed fixed-price proposal for approval</span>.
              </p>
              <ul className="mt-6 grid gap-4 text-sm leading-relaxed text-[#55337b] sm:grid-cols-2 sm:text-[15px]">
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#f4eeff] via-[#ebe4ff] to-[#e2d8ff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <rect x="24" y="28" width="232" height="112" rx="12" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
                      <path d="M44 52h72M44 68h120M44 84h96M44 100h108" stroke="#b894e8" strokeWidth="3" strokeLinecap="round" />
                      <rect x="188" y="44" width="52" height="36" rx="6" fill="#ede4ff" stroke="#6e3eb2" strokeWidth="1.5" />
                      <path d="M204 56h20M204 62h14M204 68h18" stroke="#5b3292" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                      <rect x="52" y="112" width="56" height="14" rx="4" fill="#6e3eb2" opacity="0.15" />
                      <rect x="116" y="112" width="72" height="14" rx="4" fill="#6e3eb2" opacity="0.1" />
                      <circle cx="248" cy="118" r="10" fill="#6e3eb2" opacity="0.9" />
                      <path d="M243 118l4 4 8-10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Consult
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Consultation-first</p>
                    <p className="mt-2">
                      One question at a time until your goals and constraints are clear—especially budget—then{" "}
                      {PLANNER_ASSISTANT_NAME} shifts into suggestions.
                    </p>
                  </div>
                </li>
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#fdf8ff] via-[#f3e9ff] to-[#e9dcff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <rect x="72" y="24" width="136" height="120" rx="14" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
                      <rect x="88" y="40" width="104" height="72" rx="6" fill="#ede4ff" stroke="#b894e8" strokeWidth="1.5" />
                      <path d="M96 108 L124 84 L148 96 L176 68 L192 88" stroke="#6e3eb2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
                      <circle cx="210" cy="46" r="18" fill="#fff7ed" stroke="#f59e0b" strokeWidth="2" />
                      <path d="M205 46 L209 50 L217 40" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="232" cy="118" r="6" fill="#6e3eb2" opacity="0.35" />
                      <circle cx="248" cy="104" r="4" fill="#6e3eb2" opacity="0.5" />
                      <circle cx="240" cy="130" r="5" fill="#6e3eb2" opacity="0.25" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Photos
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Photo-aware ideas</p>
                    <p className="mt-2">
                      Upload pictures of your space so the assistant can reference layout and
                      proportions when brainstorming built-ins, trim, and feature details.
                    </p>
                  </div>
                </li>
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#f8f4ff] via-[#efe6ff] to-[#e4d9ff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <rect x="28" y="36" width="92" height="104" rx="8" fill="#fff" stroke="#c9a5f1" strokeWidth="1.75" />
                      <rect x="38" y="48" width="72" height="8" rx="2" fill="#ede4ff" />
                      <rect x="38" y="64" width="56" height="6" rx="2" fill="#f5efff" />
                      <rect x="38" y="78" width="64" height="6" rx="2" fill="#f5efff" />
                      <rect x="38" y="92" width="48" height="6" rx="2" fill="#f5efff" />
                      <rect x="134" y="36" width="118" height="104" rx="8" fill="#fff" stroke="#c9a5f1" strokeWidth="1.75" />
                      <rect x="146" y="48" width="94" height="8" rx="2" fill="#ede4ff" />
                      <rect x="146" y="64" width="88" height="28" rx="4" fill="#faf6ff" stroke="#dcc6fb" strokeWidth="1" />
                      <rect x="146" y="100" width="76" height="24" rx="4" fill="#faf6ff" stroke="#dcc6fb" strokeWidth="1" />
                      <path d="M118 88 L130 88" stroke="#6e3eb2" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Next steps
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Keep it conversational</p>
                    <p className="mt-2">
                      Short answers and plain-language guidance—then refine together after you&apos;ve seen
                      initial directions. Save the summary when you&apos;re signed in.
                    </p>
                  </div>
                </li>
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateToSection("planner")}
                  className={lu.btnPrimary}
                >
                  Create a plan for my space
                </button>
                <p className="text-xs text-[#6a4a8f]">
                  Signed-in clients can save planning notes from the chat for later.
                </p>
              </div>
            </div>

            {!authUser ? (
              <div className="mt-10 rounded-2xl border border-[#dcc6fb] bg-gradient-to-br from-[#faf6ff] via-[#f5efff] to-[#ffffff] p-6 shadow-[0_12px_40px_-24px_rgba(91,33,182,0.45)] sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                  Level up your space
                </p>
                <h2 className="mt-3 text-2xl font-semibold leading-tight text-[#230f35] sm:text-3xl">
                  Turn inspiration into a plan you own — free account, real
                  carpentry support behind it.
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                  Create an account to save AI project ideas, track your
                  booking and progress photos from the crew, chat with our
                  agent anytime, and keep invoices in one place. In the planner,{" "}
                  {PLANNER_ASSISTANT_NAME} focuses on how your project could{" "}
                  <span className="font-semibold text-[#31184a]">look</span>
                  —no product lists or pricing in that chat. When you&apos;re happy with the direction, Level Up{" "}
                  <span className="font-semibold text-[#31184a]">reviews your designs</span> and reaches out with a{" "}
                  <span className="font-semibold text-[#31184a]">detailed proposal for approval</span> before work is lined up.
                </p>
                <ul className="mt-5 grid gap-2 text-sm text-[#55337b] sm:grid-cols-2 sm:text-[15px]">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                    Save and revisit planning notes from your chat with {PLANNER_ASSISTANT_NAME}
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                    See status updates and uploads from your carpenter
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                    Download PDF invoices whenever you need them
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                    One login for chat, profile, and booking prep
                  </li>
                </ul>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={() => openAuth("register")}
                    className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-8 py-4 text-base font-semibold text-white shadow-[0_12px_30px_-10px_rgba(110,62,178,0.9)] transition hover:-translate-y-0.5 hover:bg-[#5b3292] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6e3eb2]"
                  >
                    Create your free account
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth("login")}
                    className="inline-flex items-center justify-center rounded-full border-2 border-[#6e3eb2] bg-white px-8 py-4 text-base font-semibold text-[#5b3292] transition hover:bg-[#f5efff]"
                  >
                    I already have an account
                  </button>
                </div>
                <p className="mt-6 text-center text-sm text-[#6a4a8f] sm:text-left">
                  Prefer to browse pricing first?{" "}
                  <button
                    type="button"
                    onClick={() => navigateToSection("rates")}
                    className="font-semibold text-[#4a2381] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#3f1d70]"
                  >
                    View rates & open planner
                  </button>
                </p>
              </div>
            ) : null}

            <div className="mt-10 rounded-2xl border border-[#dcc6fb] bg-gradient-to-br from-[#ffffff] via-[#f9f5ff] to-[#f0e8ff] p-6 shadow-[0_12px_40px_-24px_rgba(91,33,182,0.35)] sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                How it works
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#230f35] sm:text-2xl">
                From photo to finished install in 4 steps
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                No haggling, no mystery quotes. Every job runs on our insured crews, with commercial
                general liability and WSIB (Ontario workplace insurance) coverage on eligible workers.
              </p>
              <ol className="mt-6 grid gap-4 text-sm leading-relaxed text-[#55337b] sm:grid-cols-2 sm:text-[15px]">
                <li className="rounded-xl border border-[#eddfff] bg-white p-5 shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <p className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6e3eb2] text-base font-bold text-white">1</p>
                  <p className="mt-3 font-semibold text-[#31184a]">Show us your space</p>
                  <p className="mt-2">
                    Upload photos and chat with Alex, our AI design consultant, to explore directions —
                    free, no account needed to start.
                  </p>
                </li>
                <li className="rounded-xl border border-[#eddfff] bg-white p-5 shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <p className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6e3eb2] text-base font-bold text-white">2</p>
                  <p className="mt-3 font-semibold text-[#31184a]">Approve a fixed quote</p>
                  <p className="mt-2">
                    You get a detailed written proposal. The price we agree on is the price you pay —
                    no hourly drift.
                  </p>
                </li>
                <li className="rounded-xl border border-[#eddfff] bg-white p-5 shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <p className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6e3eb2] text-base font-bold text-white">3</p>
                  <p className="mt-3 font-semibold text-[#31184a]">We handle the build</p>
                  <p className="mt-2">
                    An insured, WSIB-covered installer does the work — tidy site, careful cuts, progress
                    photos along the way.
                  </p>
                </li>
                <li className="rounded-xl border border-[#eddfff] bg-white p-5 shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <p className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6e3eb2] text-base font-bold text-white">4</p>
                  <p className="mt-3 font-semibold text-[#31184a]">Walk through &amp; pay</p>
                  <p className="mt-2">
                    You approve the finished work before final payment. Anything not right gets fixed,
                    not invoiced.
                  </p>
                </li>
              </ol>
            </div>
          </div>
        ) : null}

        {currentSection === "reviews" ? (
          <div>
            <ReviewsGallery />
          </div>
        ) : null}

        {currentSection === "rates" ? (
          <div className="rounded-3xl border border-[#e9d9ff] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.5)] sm:p-8">
            <div className="rounded-2xl border border-[#dcc6fb] bg-gradient-to-br from-[#fafbff] via-[#f5f0ff] to-[#ebe4ff] p-6 shadow-[0_12px_40px_-22px_rgba(91,33,182,0.32)] sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                Quoting &amp; billing
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#230f35] sm:text-2xl">
                One fixed quote. Zero surprises.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                Every job gets a{" "}
                <span className="font-semibold text-[#31184a]">fixed written quote</span> you approve
                before we start — no hourly meter, no watching the clock. The{" "}
                <span className="font-semibold text-[#31184a]">$150 call-out</span> covers the site visit
                and scope review, credited toward your project when you move ahead.{" "}
                <span className="font-semibold text-[#31184a]">Materials</span> are itemized in your quote
                so lumber, hardware, and finishes are all clear upfront.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                On this site today,{" "}
                <span className="font-semibold text-[#31184a]">Stripe Checkout</span> collects only your{" "}
                <span className="font-semibold text-[#31184a]">$150 call-out fee</span> when you finish
                booking—that confirms your appointment. The{" "}
                <span className="font-semibold text-[#31184a]">remaining balance</span> from your approved
                fixed quote is coordinated with you after the scope is confirmed; we&apos;ll spell out how
                each balance is paid before it hits your card.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#eddfff] bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#7a4bb8]">
                    Call-out
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[#230f35]">$150</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#55337b]">
                    Site visit and scope review. Credited toward your project when you proceed.
                  </p>
                </div>
                <div className="rounded-xl border border-[#eddfff] bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#7a4bb8]">
                    Fixed quote
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[#230f35]">Per job</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#55337b]">
                    One fixed price for the whole job, approved before work begins. The price doesn&apos;t
                    change unless the scope does.
                  </p>
                </div>
                <div className="rounded-xl border border-[#eddfff] bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#7a4bb8]">
                    Materials
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug text-[#230f35]">Itemized</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#55337b]">
                    Lumber, hardware, and finishes listed clearly in your quote. No hidden fees.
                  </p>
                </div>
              </div>
              <div className="mt-6 rounded-xl border border-[#f59e0b]/35 bg-[#fffbeb] p-4 sm:p-5">
                <p className="text-sm font-semibold text-[#92400e]">Quote disclaimer</p>
                <p className="mt-2 text-sm leading-relaxed text-[#78350f]">
                  Quotes reflect our best professional judgment ahead of the visit. Hidden
                  damage, code surprises, extra prep, or changes you request along the way can require an
                  updated quote.{" "}
                  <span className="font-semibold text-[#92400e]">
                    Material delivery fees or pickup fees
                  </span>{" "}
                  may apply when supplies need to be brought to your site or collected from suppliers.
                  {" "}
                  <span className="font-semibold text-[#92400e]">Time taken to source materials</span>
                  —for example shopping, coordinating orders, or chasing stock—can also extend the schedule.
                  We communicate adjustments as they come up so pricing never feels like a mystery.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-[#dcc6fb] bg-gradient-to-br from-[#faf8ff] to-[#f3ebff] p-5 sm:p-7">
              <h3 className="text-lg font-semibold text-[#230f35] sm:text-xl">
                Payments &amp; Stripe (what this website does today)
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[#4d2e70] sm:text-base">
                Card payments on Level Up Install run through{" "}
                <span className="font-semibold text-[#31184a]">Stripe</span>, a trusted third-party
                processor. Stripe hosts the secure checkout page—you enter your card there, and we do
                not store full card numbers on our servers.
              </p>
              <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-[#4d2e70] sm:text-base">
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Call-out fee payment:</span> The planner is for design visuals only. After you and{" "}
                    {PLANNER_ASSISTANT_NAME} settle on a direction you like, our team{" "}
                    <span className="font-semibold text-[#31184a]">reviews what you explored</span> and reaches out with a{" "}
                    <span className="font-semibold text-[#31184a]">detailed proposal for approval</span>. When it&apos;s time for the call-out fee, we&apos;ll send{" "}
                    <span className="font-semibold text-[#31184a]">Stripe Checkout</span> (or another agreed method) for the{" "}
                    <span className="font-semibold text-[#31184a]">$150 call-out fee</span> (CAD)—not inside the planner chat.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Remaining balances:</span>{" "}
                    Amounts beyond the call-out fee come from your{" "}
                    <span className="font-semibold text-[#31184a]">approved fixed quote</span> and are{" "}
                    <span className="font-semibold text-[#31184a]">not collected through this booking checkout</span>
                    . After we confirm scope, we&apos;ll confirm what&apos;s owed and how it will be
                    paid (for example invoice, follow-up Stripe payment link, or another method we agree on).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">No authorization holds here:</span>{" "}
                    This app does not currently place a card hold for quoted work. Any future flow for
                    deposits or final billing through Stripe will be spelled out before you authorize it.
                  </span>
                </li>
              </ul>
              <p className="mt-4 rounded-xl border border-[#e8d9ff] bg-white/80 p-4 text-sm leading-relaxed text-[#55337b]">
                Wrong amount or receipt issue on the call-out payment? Forward your Stripe receipt email
                or session ID and we&apos;ll help trace it.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[#dcc6fb] bg-gradient-to-br from-[#faf8ff] to-[#f4efff] p-5 sm:p-7">
              <h3 className="text-lg font-semibold text-[#230f35] sm:text-xl">
                Liability insurance &amp; WSIB
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[#4d2e70] sm:text-base">
                Level Up Install maintains{" "}
                <span className="font-semibold text-[#31184a]">commercial general liability insurance</span>{" "}
                and{" "}
                <span className="font-semibold text-[#31184a]">
                  WSIB (Workplace Safety and Insurance Board)
                </span>{" "}
                coverage for workers on jobs booked through us. Coverage applies according to current
                policies and eligibility; request a certificate or policy summary if your condo board or
                insurer asks for it.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[#55337b]">
                Call-out payment and any acknowledgements are handled when our team coordinates booking with
                you—we keep formal policy review tied to that step rather than inside the AI planner chat.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[#dcc6fb] bg-[#faf8ff] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-[#230f35]">Ready to explore?</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4d2e70] sm:text-[15px]">
                Chat with <span className="font-semibold text-[#31184a]">{PLANNER_ASSISTANT_NAME}</span> in the
                planner to refine how your project could look. When you&apos;re happy with the design direction, Level Up will{" "}
                <span className="font-semibold text-[#31184a]">review your designs</span> and contact you with a{" "}
                <span className="font-semibold text-[#31184a]">more detailed proposal for approval</span>—pricing and next steps move forward from there.
              </p>
              <button
                type="button"
                onClick={() => navigateToSection("planner")}
                className="mt-4 inline-flex rounded-full bg-[#6e3eb2] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5b3292]"
              >
                Open planner
              </button>
            </div>
          </div>
        ) : null}

        {currentSection === "planner" ? (
          <div>
            <ProjectPlannerAssistant
              welcomeDisplayName={
                authUser ? portalWelcomeName(authUser) : undefined
              }
              onRequireCreateAccount={() => {
                openAuth("register");
              }}
              onViewSavedIdeas={() => {
                if (authUser) {
                  openAccountView("saved-projects");
                } else {
                  openAuth("login");
                }
              }}
            />
          </div>
        ) : null}

        {currentSection === "account" ? (
          <ClientPortal
            key={`${portalMode}-${accountView}`}
            initialMode={portalMode}
            selectedView={accountView}
            onAuthChange={(user) => {
              setAuthUser(
                user
                  ? {
                      id: user.id,
                      username: user.username,
                      fullName: user.fullName,
                      email: user.email ?? "",
                    }
                  : null,
              );
            }}
            onLoginSuccess={() => {
              navigateToSection("planner");
            }}
          />
        ) : null}
      </section>

      <footer className="border-t border-[#e9d9ff] bg-[#faf6ff] py-10">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 text-sm leading-relaxed text-[#55337b] sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
              Level Up Install
            </p>
            <p className="mt-3">
              Finish carpenter serving Toronto &amp; the GTA — shelving, built-ins, trim, and wall
              upgrades with fixed upfront quotes.
            </p>
            <p className="mt-3">
              <button
                type="button"
                onClick={() => navigateToSection("planner")}
                className="font-semibold text-[#4a2381] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#3f1d70]"
              >
                Start your free design consult
              </button>
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
              Service area
            </p>
            <p className="mt-3">
              Toronto · North York · Scarborough · Etobicoke · Mississauga · Markham · Vaughan ·
              Richmond Hill
            </p>
            <p className="mt-2 text-xs text-[#6a4a8f]">
              Elsewhere in the GTA? Ask — we&apos;ll confirm coverage when you book.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
              Explore
            </p>
            <ul className="mt-3 space-y-2">
              <li>
                <button type="button" onClick={() => navigateToSection("rates")} className="font-semibold text-[#4a2381] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#3f1d70]">
                  Rates &amp; quoting
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateToSection("planner")} className="font-semibold text-[#4a2381] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#3f1d70]">
                  AI design planner
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateToSection("reviews")} className="font-semibold text-[#4a2381] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#3f1d70]">
                  Why Level Up Install
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl px-4 text-xs text-[#6a4a8f] sm:px-6">
          <p>
            Commercial general liability insurance &amp; WSIB coverage on eligible workers.
            © {new Date().getFullYear()} Level Up Install · Toronto, Ontario
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
