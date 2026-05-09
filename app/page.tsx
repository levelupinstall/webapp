"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ClientPortal from "./components/client-portal";
import FloatingAgentChat from "./components/floating-agent-chat";
import ProjectPlannerAssistant from "./components/project-planner-assistant";
import { PLANNER_ASSISTANT_NAME } from "@/lib/planner-brand";
import ReviewsGallery from "./components/reviews-gallery";

type SectionKey = "overview" | "reviews" | "rates" | "planner" | "account";
type AccountMenuView = "saved-projects" | "invoices" | "profile" | "bookings";
type AuthUser = {
  id: string;
  username: string;
  fullName: string;
};

function HomeContent() {
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

  useEffect(() => {
    async function loadAuthState() {
      const response = await fetch("/api/portal/me");
      if (!response.ok) {
        setAuthUser(null);
        return;
      }
      const data = (await response.json()) as {
        user: { id: string; username: string; fullName: string };
      };
      setAuthUser(data.user);
    }
    void loadAuthState();
  }, []);

  useEffect(() => {
    if (queryPortalView !== "invoices") return undefined;
    const timer = window.setTimeout(() => {
      setAccountView("invoices");
      setActiveSection("account");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queryPortalView]);

  function openAuth(mode: "login" | "register") {
    setPortalMode(mode);
    setActiveSection("account");
    setMenuOpen(false);
  }

  function openAccountView(view: AccountMenuView) {
    setAccountView(view);
    setActiveSection("account");
    setMenuOpen(false);
  }

  async function handleHeaderLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    setAuthUser(null);
    setActiveSection("overview");
    setMenuOpen(false);
  }

  const sectionButtonClass = (section: SectionKey) =>
    `inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm ${
      currentSection === section
        ? "bg-[#6e3eb2] text-white"
        : "border border-[#6e3eb2] text-[#5b3292] hover:bg-[#f3ebff]"
    }`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f2ff] via-[#f2e9ff] to-[#ffffff] px-4 pb-10 pt-36 text-[#281437] sm:px-6 sm:pt-40 lg:px-8">
      <div className="fixed inset-x-0 top-3 z-50 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 rounded-2xl border border-[#dfccfb] bg-white/90 py-4 pl-3 pr-3 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.75)] backdrop-blur sm:py-5 sm:pl-5 sm:pr-5">
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
                {authUser.fullName?.trim() || authUser.username}
              </p>
              <button
                type="button"
                onClick={handleHeaderLogout}
                className="inline-flex items-center justify-center rounded-full border border-[#6e3eb2] px-3 py-2 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f3ebff] sm:px-4 sm:text-sm"
              >
                Log Out
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#5b3292] sm:px-4 sm:text-sm"
              >
                Menu
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-[60] mt-2 w-52 rounded-xl border border-[#dcc6fb] bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => openAccountView("saved-projects")}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#4d2e70] hover:bg-[#f5efff]"
                  >
                    Saved Projects
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountView("invoices")}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#4d2e70] hover:bg-[#f5efff]"
                  >
                    Invoices
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountView("profile")}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#4d2e70] hover:bg-[#f5efff]"
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountView("bookings")}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#4d2e70] hover:bg-[#f5efff]"
                  >
                    Bookings
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="inline-flex items-center justify-center rounded-full border border-[#6e3eb2] px-3 py-2 text-xs font-semibold text-[#5b3292] transition hover:bg-[#f3ebff] sm:px-4 sm:text-sm"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => openAuth("register")}
                className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#5b3292] sm:px-4 sm:text-sm"
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </div>
      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-6 rounded-2xl border border-[#dfccfb] bg-white/80 p-2 shadow-[0_10px_24px_-20px_rgba(91,33,182,0.7)]">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("overview")}
              className={sectionButtonClass("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("reviews")}
              className={sectionButtonClass("reviews")}
            >
              Reviews
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("rates")}
              className={sectionButtonClass("rates")}
            >
              Rates
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("planner")}
              className={sectionButtonClass("planner")}
            >
              Planner
            </button>
          </div>
        </div>

        {currentSection === "overview" ? (
          <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_15px_50px_-20px_rgba(91,33,182,0.45)] backdrop-blur-sm sm:p-10">
            <div className="mb-6 overflow-hidden rounded-2xl border border-[#e6d7ff] bg-white p-2 shadow-[0_8px_24px_-16px_rgba(91,33,182,0.6)]">
              <Image
                src="/level-up-install-logo.jpg"
                alt="Level Up Install logo"
                width={1024}
                height={576}
                className="h-auto w-full rounded-xl object-cover"
                priority
              />
            </div>

            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf8ff] p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                Scope we&apos;re built for
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#230f35] sm:text-2xl">
                Here are some different ways we can level up your space.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                Every visit starts with what you need done—big or small. Below are the kinds of tasks
                homeowners book us for most often; if something similar is on your list, we&apos;ll
                confirm feasibility and timing when we scope the job.
              </p>
              <ul className="mt-6 grid gap-3 text-sm leading-relaxed text-[#55337b] sm:grid-cols-2 sm:gap-x-8 sm:text-[15px]">
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Pictures &amp; wall décor —</span>{" "}
                    Hang framed art, canvas, mirrors, gallery walls, and lighter wall-mounted displays
                    with the right anchors for your walls (drywall, plaster, or masonry where applicable).
                    Bathroom accessories (towel bars, TP holders, robe hooks), curtain rods, coat hooks,
                    mailboxes, and house numbers too.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Shelving —</span> Floating
                    shelves, bracketed units, closet rods, closet shelving, and adjustable systems
                    installed level and secure—including closet organizers and shoe racks, whether custom
                    built-ins or IKEA closet systems we assemble and install for you.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">IKEA &amp; flat-pack furniture —</span>{" "}
                    Assembly of IKEA and similar ready-to-assemble pieces—bookcases, wardrobes, desks,
                    dressers, tables, and storage units—built square, leveled, and wall-anchored when
                    the instructions or safety requirements call for it.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Cabinets —</span> Wall and base
                    cabinet installs, filler panels, scribes, hardware and hinge adjustments, and
                    coordination with appliances where the scope fits our trade.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Trim &amp; moulding —</span>{" "}
                    Baseboard, casing, quarter-round or shoe, chair rail, and crown where appropriate
                    to the space—installed tight with clean miters and returns. Minor trim touch-ups
                    after a move, plus backing or blocking we coordinate for grab bars or handrails when
                    it ties into casing or nearby carpentry.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Doors —</span> Hang or swap
                    interior doors, adjust hinges and strikes, bore for hardware, and minor planing
                    when clearances need tuning (within safe limits). Baby or pet gates secured to jambs
                    or studs when the opening is part of the scope.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">TV mounting —</span> Secure mounts
                    to studs or rated anchors, level and centered to your layout; basic cable tidy and
                    bracket installs where access allows (complex low-voltage runs may need a
                    specialist). Tip-over safety: anchoring dressers and similar pieces to studs when that
                    is the core of the task.
                  </span>
                </li>
              </ul>
              <p className="mt-6 text-sm text-[#6a4a8f]">
                Larger renovations, structural changes, or trades outside carpentry may require
                partners we can help you line up after we see the site. We maintain commercial general
                liability insurance and WSIB coverage for workers on jobs booked through Level Up
                Install—ask if you need a certificate for your building or insurer.
              </p>
            </div>

            <div className="mt-10 rounded-2xl border border-[#e8d9ff] bg-[#faf8ff] p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                About our AI tools
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#230f35] sm:text-2xl">
                See what&apos;s possible before you pick up a hammer.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                {PLANNER_ASSISTANT_NAME}, our planning consultant, chats through a few focused questions
                first—budget, your space, what you already have in mind—then offers short, practical
                directions (no shopping lists). Add photos anytime. Save highlights with a free account
                and use them when you book. Nothing here replaces an on-site visit or firm quote.
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
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#faf6ff] via-[#f0e8ff] to-[#e5d9ff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <rect x="16" y="16" width="248" height="136" rx="12" fill="#fff" stroke="#e8d9ff" strokeWidth="2" />
                      <rect x="152" y="72" width="112" height="72" rx="12" fill="#6e3eb2" stroke="#5b3292" strokeWidth="2" />
                      <circle cx="174" cy="96" r="8" fill="#fff" opacity="0.95" />
                      <path d="M172 96 L173 97 L177 93" stroke="#6e3eb2" strokeWidth="1.5" strokeLinecap="round" />
                      <rect x="166" y="108" width="84" height="6" rx="2" fill="#fff" opacity="0.35" />
                      <rect x="166" y="120" width="64" height="6" rx="2" fill="#fff" opacity="0.25" />
                      <circle cx="236" cy="96" r="4" fill="#c4b5fd" />
                      <circle cx="246" cy="96" r="4" fill="#c4b5fd" opacity="0.6" />
                      <circle cx="256" cy="96" r="4" fill="#c4b5fd" opacity="0.35" />
                      <rect x="36" y="44" width="88" height="6" rx="2" fill="#ede4ff" />
                      <rect x="36" y="56" width="72" height="6" rx="2" fill="#f5efff" />
                      <rect x="36" y="68" width="80" height="6" rx="2" fill="#f5efff" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Chat
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Floating chat agent</p>
                    <p className="mt-2">
                      Ask follow-ups anytime from the corner bubble for pricing prep, scope wording,
                      or next steps toward booking.
                    </p>
                  </div>
                </li>
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSection("planner")}
                  className="inline-flex items-center justify-center rounded-full bg-[#6e3eb2] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_26px_-12px_rgba(110,62,178,0.85)] transition hover:-translate-y-0.5 hover:bg-[#5b3292]"
                >
                  Create a plan for my space
                </button>
                <p className="text-xs text-[#6a4a8f]">
                  Signed-in clients can save planning notes from the chat for later.
                </p>
              </div>
            </div>

            <div className="mt-10 rounded-2xl border border-[#dcc6fb] bg-gradient-to-br from-[#ffffff] via-[#f9f5ff] to-[#f0e8ff] p-6 shadow-[0_12px_40px_-24px_rgba(91,33,182,0.35)] sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4bb8]">
                Our process
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#230f35] sm:text-2xl">
                We match the carpenter to your job—so your upgrade stays smooth.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                After you book and share your scope, we look at{" "}
                <span className="font-semibold text-[#31184a]">skills</span>,{" "}
                <span className="font-semibold text-[#31184a]">experience</span>,{" "}
                <span className="font-semibold text-[#31184a]">location</span>, and{" "}
                <span className="font-semibold text-[#31184a]">availability</span> to assign a crew member
                who fits your project—not just whoever has an open slot. That means clearer communication,
                fewer surprises, and workmanship aligned with what your space needs. Crews assigned to
                your visit operate under our commercial general liability insurance and WSIB (Ontario
                workplace insurance) coverage for eligible workers.
              </p>
              <ul className="mt-6 grid gap-4 text-sm leading-relaxed text-[#55337b] sm:grid-cols-2 sm:text-[15px]">
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#faf8ff] via-[#efe8ff] to-[#e4dcff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <circle cx="140" cy="84" r="52" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
                      <path d="M118 96 L128 76 L138 88 L158 64 L172 96" stroke="#6e3eb2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="98" y="108" width="84" height="14" rx="6" fill="#ede4ff" stroke="#b894e8" strokeWidth="1.5" />
                      <circle cx="112" cy="115" r="4" fill="#6e3eb2" opacity="0.6" />
                      <circle cx="140" cy="115" r="4" fill="#6e3eb2" opacity="0.4" />
                      <circle cx="168" cy="115" r="4" fill="#6e3eb2" opacity="0.25" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Skills
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Right craft for the scope</p>
                    <p className="mt-2">
                      Trim, built-ins, and finishing details take different strengths—we pair your job with
                      carpenters whose strengths align with the work you need done.
                    </p>
                  </div>
                </li>
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#fdfaff] via-[#f3ebff] to-[#eadcff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <rect x="56" y="36" width="168" height="100" rx="12" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
                      <path d="M76 56 L204 56" stroke="#ede4ff" strokeWidth="8" strokeLinecap="round" />
                      <path d="M76 80 L172 80" stroke="#f5efff" strokeWidth="8" strokeLinecap="round" />
                      <path d="M76 104 L196 104" stroke="#f5efff" strokeWidth="8" strokeLinecap="round" />
                      <path d="M204 72 L228 56 L228 112 Z" fill="#fde68a" stroke="#d97706" strokeWidth="1.5" />
                      <circle cx="218" cy="72" r="5" fill="#fff" stroke="#b45309" strokeWidth="1" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Experience
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Seasoned where it counts</p>
                    <p className="mt-2">
                      Similar projects in the rear view mirror reduce rework—we weigh relevant experience so
                      your timeline and finishes benefit from carpenters who have done comparable work.
                    </p>
                  </div>
                </li>
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#f8f6ff] via-[#ebe4ff] to-[#dfd5ff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <ellipse cx="140" cy="92" rx="88" ry="52" fill="#faf6ff" stroke="#c9a5f1" strokeWidth="2" />
                      <circle cx="140" cy="88" r="8" fill="#6e3eb2" stroke="#fff" strokeWidth="2" />
                      <path d="M140 96 L140 118" stroke="#6e3eb2" strokeWidth="3" strokeLinecap="round" />
                      <path d="M72 104 Q112 72 140 72 Q176 72 216 104" stroke="#b894e8" strokeWidth="2" strokeDasharray="6 6" fill="none" />
                      <rect x="204" y="44" width="36" height="28" rx="6" fill="#fff" stroke="#6e3eb2" strokeWidth="1.75" />
                      <path d="M216 54 L228 62 L216 68 Z" fill="#ede4ff" stroke="#6e3eb2" strokeWidth="1" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Location
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Sensible routing to your address</p>
                    <p className="mt-2">
                      Service geography matters—we factor where your project is so crews spend less time in
                      transit and more time on your upgrade.
                    </p>
                  </div>
                </li>
                <li className="flex flex-col overflow-hidden rounded-xl border border-[#eddfff] bg-white shadow-[0_8px_28px_-18px_rgba(91,33,182,0.35)]">
                  <div
                    className="relative aspect-[5/3] bg-gradient-to-br from-[#faf6ff] via-[#efe9ff] to-[#e2d8ff]"
                    aria-hidden
                  >
                    <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" viewBox="0 0 280 168" fill="none">
                      <rect x="72" y="36" width="136" height="104" rx="12" fill="#fff" stroke="#c9a5f1" strokeWidth="2" />
                      <rect x="88" y="52" width="104" height="72" rx="8" fill="#faf6ff" stroke="#dcc6fb" strokeWidth="1.5" />
                      <rect x="96" y="62" width="22" height="18" rx="3" fill="#ede4ff" stroke="#6e3eb2" strokeWidth="1.25" />
                      <rect x="126" y="62" width="22" height="18" rx="3" fill="#ede4ff" stroke="#b894e8" strokeWidth="1.25" opacity="0.6" />
                      <rect x="156" y="62" width="22" height="18" rx="3" fill="#ede4ff" stroke="#b894e8" strokeWidth="1.25" opacity="0.35" />
                      <rect x="96" y="88" width="88" height="10" rx="2" fill="#ede4ff" opacity="0.7" />
                      <circle cx="200" cy="116" r="22" fill="#6e3eb2" opacity="0.92" />
                      <path d="M200 106 L200 116 L206 122" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6e3eb2] shadow-sm">
                      Availability
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-[#31184a]">Schedules that actually fit</p>
                    <p className="mt-2">
                      Calendar-aware coordination helps avoid juggling—we align your preferred timing with
                      carpenter availability so installs stay predictable from kickoff to walk-through.
                    </p>
                  </div>
                </li>
              </ul>
              <p className="mt-6 text-xs text-[#6a4a8f]">
                We finalize crew assignment after payment details and scope review—usually alongside your
                confirmation messages.
              </p>
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
                  agent anytime, and keep invoices in one place. When you are
                  ready, booking your call-out starts from the planner after you and{" "}
                  {PLANNER_ASSISTANT_NAME} have a direction.
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
                    onClick={() => setActiveSection("rates")}
                    className="font-semibold text-[#4a2381] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#3f1d70]"
                  >
                    View rates & open planner
                  </button>
                </p>
              </div>
            ) : null}
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
                Straightforward pricing—with room for what the site reveals on the day.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                Every job starts with our{" "}
                <span className="font-semibold text-[#31184a]">minimum call-out charge</span>, then moves
                to labor at{" "}
                <span className="font-semibold text-[#31184a]">$75 per hour</span> once work extends beyond
                that window.{" "}
                <span className="font-semibold text-[#31184a]">Materials</span> are tracked and billed
                separately from labor so you can see lumber, hardware, finishes, and supplies clearly.
                Before we swing tools, you&apos;ll get an{" "}
                <span className="font-semibold text-[#31184a]">estimate of how long the work should take</span>
                —helpful for budgeting and scheduling—but treat it as a planning guide, not a guarantee.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#4d2e70]">
                On this site today,{" "}
                <span className="font-semibold text-[#31184a]">Stripe Checkout</span> collects only your{" "}
                <span className="font-semibold text-[#31184a]">$150 call-out fee</span> when you finish
                booking—that confirms your appointment. Additional charges for{" "}
                <span className="font-semibold text-[#31184a]">materials</span> and{" "}
                <span className="font-semibold text-[#31184a]">labor</span> beyond that are coordinated with
                you after scope is reviewed on site; we&apos;ll spell out how each balance is paid before it
                hits your card.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#eddfff] bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#7a4bb8]">
                    Call-out
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[#230f35]">$150</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#55337b]">
                    Minimum charge covers getting to your door and getting the scope dialed in.
                  </p>
                </div>
                <div className="rounded-xl border border-[#eddfff] bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#7a4bb8]">
                    Labor &amp; materials
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[#230f35]">$75/hr</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#55337b]">
                    Hourly rate plus materials used on your project, tracked for transparency.
                  </p>
                </div>
                <div className="rounded-xl border border-[#eddfff] bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#7a4bb8]">
                    Time estimate
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug text-[#230f35]">Planning window</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#55337b]">
                    You&apos;ll receive an estimated duration before work begins—final hours can shift once
                    we see real site conditions.
                  </p>
                </div>
              </div>
              <div className="mt-6 rounded-xl border border-[#f59e0b]/35 bg-[#fffbeb] p-4 sm:p-5">
                <p className="text-sm font-semibold text-[#92400e]">Estimate disclaimer</p>
                <p className="mt-2 text-sm leading-relaxed text-[#78350f]">
                  Durations and scope lines are our best professional judgment ahead of the visit. Hidden
                  damage, code surprises, extra prep, or changes you request along the way can add—or
                  occasionally save—time.{" "}
                  <span className="font-semibold text-[#92400e]">
                    Material delivery fees or pickup fees
                  </span>{" "}
                  may apply when supplies need to be brought to your site or collected from suppliers.
                  {" "}
                  <span className="font-semibold text-[#92400e]">Time taken to source materials</span>
                  —for example shopping, coordinating orders, or chasing stock—can also extend the schedule
                  and billed labor. We communicate adjustments as they come up so billing never feels like a
                  mystery.
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
                    <span className="font-semibold text-[#31184a]">Booking checkout:</span> From the planner,
                    after you and {PLANNER_ASSISTANT_NAME} have a planning direction, the{" "}
                    <span className="font-semibold text-[#31184a]">Secure your booking</span> section sends
                    you to{" "}
                    <span className="font-semibold text-[#31184a]">Stripe Checkout</span>. Completing payment
                    charges your card for the{" "}
                    <span className="font-semibold text-[#31184a]">$150 call-out fee</span> (CAD).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">Materials &amp; labor balances:</span>{" "}
                    Additional amounts for materials and hourly labor are{" "}
                    <span className="font-semibold text-[#31184a]">not collected through this booking checkout</span>
                    . After we review scope on site, we&apos;ll confirm what&apos;s owed and how it will be
                    paid (for example invoice, follow-up Stripe payment link, or another method we agree on).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6e3eb2]" />
                  <span>
                    <span className="font-semibold text-[#31184a]">No authorization holds here:</span>{" "}
                    This app does not currently place a card hold for estimated labor. Any future flow for
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
                By booking and paying the call-out fee, you acknowledge that service is provided under
                these arrangements as described in our Terms of Service at checkout.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[#dcc6fb] bg-[#faf8ff] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-[#230f35]">Ready to book?</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4d2e70] sm:text-[15px]">
                Chat with <span className="font-semibold text-[#31184a]">{PLANNER_ASSISTANT_NAME}</span> in the
                planner — then use <span className="font-semibold text-[#31184a]">Secure your booking</span>{" "}
                right below the conversation to pay the call-out fee and send your details to our team.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection("planner")}
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
              onRequireCreateAccount={() => {
                openAuth("register");
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
                  ? { id: user.id, username: user.username, fullName: user.fullName }
                  : null,
              );
            }}
          />
        ) : null}
      </section>
      <FloatingAgentChat
        onRequireLogin={() => {
          openAuth("login");
        }}
        onRequireCreateAccount={() => {
          openAuth("register");
        }}
      />
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
