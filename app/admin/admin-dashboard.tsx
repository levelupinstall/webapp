"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { JobCompletionSocialPanel } from "./job-completion-social-panel";
import { WorkProposalsCrm, type WorkProposalRow } from "./work-proposals-crm";

type AiPlannerActivity = {
  id: string;
  createdAt: string;
  promptPreview: string;
  replyPreview: string;
  intakeSummary: string;
  imageCount: number;
  conceptImages?: Array<{ mimeType: string; dataUrl: string }>;
};

type PortalClient = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  serviceAddress: string;
  avatarDataUrl: string;
  ideas: { id: string; title: string }[];
  invoices: {
    id: string;
    projectName: string;
    amountCents: number;
    status: string;
    issuedAt: string;
    receiptEmail?: string;
  }[];
  projectStatus: { phase: string; updatedAt: string; details: string };
  carpenterUploads: { id: string; caption: string; uploadedAt: string }[];
  spacePhotos?: { id: string; caption: string; uploadedAt: string }[];
  aiPlannerActivity: AiPlannerActivity[];
  lastLoginAt?: string | null;
  portalAnalytics?: {
    savedProjectsSectionOpens: number;
    spacePhotosSectionOpens: number;
  };
  communicationLog?: Array<{
    id: string;
    channel: "email" | "sms" | "app_notice";
    summary: string;
    detail?: string;
    sentAt: string;
    recordedBy?: string;
  }>;
  /** Request/geo snapshot at portal registration (when captured). */
  signupLocationLog?: unknown;
  workProposals?: WorkProposalRow[];
};

type CarpenterRow = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  availabilityNotes: string;
  googleCalendarConnected: boolean;
  googleCalendarEmail: string;
  activeJobCount: number;
  upcomingJobCount: number;
  jobs: JobRow[];
  signupLocationLog?: unknown;
};

type Receipt = {
  id: string;
  title: string;
  amountCents: number;
  imageDataUrl: string;
  createdAt: string;
};

type JobPayment = {
  id: string;
  amountCents: number;
  paidAt: string;
  expectedAt?: string;
  status: "paid" | "scheduled";
};

type JobRow = {
  id: string;
  title: string;
  status: "upcoming" | "completed" | "active";
  startDate: string;
  designNotes: string;
  scopeOfWork: string;
  client: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  clientPortalUserId?: string;
  estimatedHours?: number;
  actualHours?: number;
  materialCostCents?: number;
  toolsNeeded: string[];
  materialsNeeded: string[];
  materialsFulfillment?: "pickup" | "on_site" | "mixed";
  materialPrepNotes?: string;
  availabilityReview?: "pending" | "cleared";
  formalProposalIntake?: { portalUserId: string; proposalId: string };
  media?: Array<{
    id: string;
    type: "image" | "video";
    url: string;
    caption: string;
    phase?: string;
  }>;
  receipts: Receipt[];
  payments: JobPayment[];
  carpenterId: string;
  carpenterUsername: string;
  carpenterFullName: string;
  receiptsTotalCents: number;
  receiptCount: number;
};

function splitJobChecklistLines(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

type ActivityRow = {
  id: string;
  createdAt: string;
  type: "ai_planner" | "job_assigned" | "job_status" | "receipt_uploaded";
  title: string;
  detail: string;
  clientName?: string;
  carpenterName?: string;
  jobTitle?: string;
};

type QuarterlyReport = {
  period: {
    year: number;
    quarter: 1 | 2 | 3 | 4;
    startIso: string;
    endIso: string;
    /** Human-readable range for UI and exports */
    label: string;
  };
  totals: {
    invoicesPaidCents: number;
    invoicesDueCents: number;
    receiptsCents: number;
    payoutsPaidCents: number;
    payoutsScheduledCents: number;
  };
  counts: {
    activityEvents: number;
    invoices: number;
    receipts: number;
    payouts: number;
    jobsStarted: number;
    jobsCompleted: number;
  };
  activity: ActivityRow[];
  invoices: Array<{
    id: string;
    clientName: string;
    clientEmail: string;
    projectName: string;
    amountCents: number;
    status: string;
    issuedAt: string;
  }>;
  receipts: Array<{
    id: string;
    carpenterName: string;
    clientName: string;
    jobTitle: string;
    title: string;
    amountCents: number;
    createdAt: string;
    imageDataUrl: string;
  }>;
  payouts: Array<{
    id: string;
    carpenterName: string;
    jobTitle: string;
    amountCents: number;
    status: "paid" | "scheduled";
    date: string;
  }>;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

type ReportRangeKind =
  | "this_month"
  | "last_month"
  | "quarter"
  | "ytd"
  | "last_year";

function slugForReportFilename(label: string) {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "report";
}

function communicationChannelLabel(channel: "email" | "sms" | "app_notice") {
  switch (channel) {
    case "sms":
      return "SMS";
    case "app_notice":
      return "In-app";
    default:
      return "Email";
  }
}

function parseSignupCoord(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function SignupLocationReadout(props: { log: unknown }): ReactNode {
  if (
    props.log === null ||
    props.log === undefined ||
    typeof props.log !== "object" ||
    Array.isArray(props.log)
  ) {
    return (
      <p className="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-600">
        No signup location captured yet (account created before logging was enabled, or the server had
        no geo/IP headers — common on local development).
      </p>
    );
  }

  const o = props.log as Record<string, unknown>;
  const lat = parseSignupCoord(o.latitude);
  const lng = parseSignupCoord(o.longitude);
  const hasValidMap =
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  const keys = [
    "recordedAt",
    "city",
    "region",
    "country",
    "latitude",
    "longitude",
    "ip",
    "source",
  ] as const;

  const rows: { label: string; value: string }[] = [];
  for (const key of keys) {
    if (hasValidMap && (key === "latitude" || key === "longitude")) continue;
    const v = o[key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    rows.push({ label: key, value: String(v) });
  }
  for (const key of Object.keys(o)) {
    if ((keys as readonly string[]).includes(key)) continue;
    rows.push({ label: key, value: String(o[key]) });
  }

  const mapEmbedSrc = hasValidMap
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=11&output=embed`
    : "";
  const mapOpenHref = hasValidMap
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
    : "";
  const osmHref = hasValidMap ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}` : "";

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <h5 className="text-xs font-semibold uppercase text-zinc-500">
        Signup location snapshot
      </h5>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
        Captured from the HTTP request when they registered (edge geo + forwarded IP when
        available — approximate, not GPS).
      </p>

      {hasValidMap ? (
        <div className="mt-3 space-y-2">
          <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950">
            <iframe
              title="Approximate signup location"
              src={mapEmbedSrc}
              className="h-56 w-full border-0 sm:h-64"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <span>
              Approx. coordinates:{" "}
              <span className="font-mono text-zinc-400">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </span>
            </span>
            <a
              href={mapOpenHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 underline hover:text-violet-300"
            >
              Google Maps
            </a>
            <a
              href={osmHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 underline hover:text-violet-300"
            >
              OpenStreetMap
            </a>
          </div>
        </div>
      ) : null}

      <dl className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs text-zinc-500 capitalize">{row.label}</dt>
            <dd className="font-medium text-white break-all">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AdminDashboard() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [clients, setClients] = useState<PortalClient[]>([]);
  const [carpenters, setCarpenters] = useState<CarpenterRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [socialIntegration, setSocialIntegration] = useState<{
    facebook: boolean;
    siteUrl?: string;
    brandName: string;
  } | null>(null);

  const [tab, setTab] = useState<
    | "feed"
    | "pending_jobs"
    | "upcoming_jobs"
    | "completed_jobs"
    | "payments"
    | "clients"
    | "carpenters"
  >("feed");
  const [feedTypeFilter, setFeedTypeFilter] = useState<"all" | ActivityRow["type"]>("all");
  const [feedClientFilter, setFeedClientFilter] = useState("all");
  const [feedCarpenterFilter, setFeedCarpenterFilter] = useState("all");
  const [feedSearch, setFeedSearch] = useState("");
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [deleteClientBusyId, setDeleteClientBusyId] = useState<string | null>(null);
  const [portalDeleteConfirmClient, setPortalDeleteConfirmClient] =
    useState<PortalClient | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [balanceInvoiceDraft, setBalanceInvoiceDraft] = useState({
    title: "",
    dollars: "",
    notes: "",
  });
  const [balanceInvoiceFlash, setBalanceInvoiceFlash] = useState<{
    type: "ok" | "err";
    message: string;
  } | null>(null);
  const [balanceInvoiceSubmitting, setBalanceInvoiceSubmitting] = useState(false);

  const [commLogDraft, setCommLogDraft] = useState<{
    channel: "email" | "sms" | "app_notice";
    summary: string;
    detail: string;
  }>({ channel: "email", summary: "", detail: "" });
  const [commLogBusy, setCommLogBusy] = useState(false);
  const [commLogFlash, setCommLogFlash] = useState<{ type: "ok" | "err"; message: string } | null>(
    null,
  );

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCarpenterId, setAssignCarpenterId] = useState("");
  const [assignClientPortalId, setAssignClientPortalId] = useState("");
  const [assignTitle, setAssignTitle] = useState("");
  const [assignScope, setAssignScope] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignEstHours, setAssignEstHours] = useState("");
  const [assignMaterialDollars, setAssignMaterialDollars] = useState("");
  const [assignToolsNeeded, setAssignToolsNeeded] = useState("");
  const [assignMaterialsNeeded, setAssignMaterialsNeeded] = useState("");
  const [assignMaterialsFulfillment, setAssignMaterialsFulfillment] = useState<
    "" | "pickup" | "on_site" | "mixed"
  >("");
  const [assignMaterialPrepNotes, setAssignMaterialPrepNotes] = useState("");
  const [assignSkipAvailabilityPrompt, setAssignSkipAvailabilityPrompt] = useState(false);
  const [assignStatus, setAssignStatus] = useState<JobRow["status"]>("active");
  const [assignManualName, setAssignManualName] = useState("");
  const [assignManualEmail, setAssignManualEmail] = useState("");
  const [assignManualPhone, setAssignManualPhone] = useState("");
  const [assignManualAddress, setAssignManualAddress] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState("");
  const now = new Date();
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportQuarter, setReportQuarter] = useState<1 | 2 | 3 | 4>(
    (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  );
  const [reportRangeKind, setReportRangeKind] = useState<ReportRangeKind>("quarter");

  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const res = await fetch("/api/admin/overview");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Could not load CRM data.");
      const data = (await res.json()) as {
        clients: PortalClient[];
        carpenters: CarpenterRow[];
        jobs: JobRow[];
        activityFeed: ActivityRow[];
      };
      setClients(data.clients);
      setCarpenters(data.carpenters);
      setJobs(data.jobs);
      setActivityFeed(data.activityFeed);
    } catch {
      setOverviewError("Failed to load overview. Try again.");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBalanceInvoiceDraft({ title: "", dollars: "", notes: "" });
      setBalanceInvoiceFlash(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expandedClientId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommLogDraft({ channel: "email", summary: "", detail: "" });
      setCommLogFlash(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expandedClientId]);

  async function submitBalanceInvoice(clientId: string) {
    setBalanceInvoiceFlash(null);
    setBalanceInvoiceSubmitting(true);
    try {
      const res = await fetch("/api/admin/portal-balance-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUserId: clientId,
          projectName: balanceInvoiceDraft.title.trim() || "Project balance",
          amountDollars: balanceInvoiceDraft.dollars,
          lineItemsSummary: balanceInvoiceDraft.notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBalanceInvoiceFlash({
          type: "err",
          message: typeof data.error === "string" ? data.error : "Could not create invoice.",
        });
        return;
      }
      setBalanceInvoiceDraft({ title: "", dollars: "", notes: "" });
      setBalanceInvoiceFlash({
        type: "ok",
        message:
          "Balance invoice created. The customer pays from Client Portal → Invoices (Stripe Checkout).",
      });
      await refreshOverview();
    } finally {
      setBalanceInvoiceSubmitting(false);
    }
  }

  async function submitPortalCommunication(clientId: string) {
    const summary = commLogDraft.summary.trim();
    if (!summary) {
      setCommLogFlash({ type: "err", message: "Enter a short summary of what you sent." });
      return;
    }
    setCommLogBusy(true);
    setCommLogFlash(null);
    try {
      const res = await fetch("/api/admin/portal-communication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUserId: clientId,
          channel: commLogDraft.channel,
          summary,
          detail: commLogDraft.detail.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCommLogFlash({
          type: "err",
          message: typeof data.error === "string" ? data.error : "Could not save communication.",
        });
        return;
      }
      setCommLogDraft({ channel: commLogDraft.channel, summary: "", detail: "" });
      setCommLogFlash({ type: "ok", message: "Logged for this customer." });
      await refreshOverview();
    } finally {
      setCommLogBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/me");
        const data = (await res.json()) as { authenticated: boolean };
        if (!cancelled) {
          setAuthenticated(Boolean(data.authenticated));
          if (data.authenticated) void refreshOverview();
        }
      } catch {
        if (!cancelled) setAuthenticated(false);
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshOverview]);

  useEffect(() => {
    if (!authenticated) {
      queueMicrotask(() => setSocialIntegration(null));
      return;
    }
    let cancelled = false;
    void fetch("/api/admin/social/status")
      .then((res) => res.json())
      .then((data: { facebook?: boolean; siteUrl?: string; brandName?: string }) => {
        if (cancelled || typeof data.facebook !== "boolean") return;
        setSocialIntegration({
          facebook: data.facebook,
          siteUrl: typeof data.siteUrl === "string" ? data.siteUrl : undefined,
          brandName: typeof data.brandName === "string" ? data.brandName : "Our crew",
        });
      })
      .catch(() => {
        if (!cancelled) setSocialIntegration({ facebook: false, brandName: "Our crew" });
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(typeof data.error === "string" ? data.error : "Login failed.");
        return;
      }
      setAuthenticated(true);
      setPassword("");
      await refreshOverview();
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setClients([]);
    setCarpenters([]);
    setJobs([]);
    setActivityFeed([]);
  }

  async function executeConfirmedPortalDelete() {
    const client = portalDeleteConfirmClient;
    if (!client) return;

    setDeleteClientBusyId(client.id);
    try {
      const res = await fetch(
        `/api/admin/portal-users/${encodeURIComponent(client.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        globalThis.alert(data.error || "Could not delete account.");
        return;
      }
      setPortalDeleteConfirmClient(null);
      setExpandedClientId(null);
      await refreshOverview();
    } finally {
      setDeleteClientBusyId(null);
    }
  }

  const carpentersByWorkload = useMemo(() => {
    return [...carpenters].sort((a, b) => {
      const load = (c: CarpenterRow) => c.activeJobCount * 3 + c.upcomingJobCount;
      return load(a) - load(b);
    });
  }, [carpenters]);

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    setAssignError("");
    setAssignSubmitting(true);
    try {
      const materialCents =
        assignMaterialDollars.trim() === ""
          ? undefined
          : Math.round(Number.parseFloat(assignMaterialDollars) * 100);
      if (
        assignMaterialDollars.trim() !== "" &&
        (!Number.isFinite(materialCents) || materialCents === undefined || materialCents < 0)
      ) {
        setAssignError("Enter a valid material cost or leave blank.");
        return;
      }

      const est =
        assignEstHours.trim() === ""
          ? undefined
          : Number.parseFloat(assignEstHours);
      if (assignEstHours.trim() !== "" && (!Number.isFinite(est) || est! < 0)) {
        setAssignError("Enter valid estimated hours or leave blank.");
        return;
      }

      const portalId = assignClientPortalId.trim();
      const payload: Record<string, unknown> = {
        carpenterId: assignCarpenterId,
        title: assignTitle,
        scopeOfWork: assignScope,
        designNotes: assignNotes || "Assigned via CRM.",
        status: assignStatus,
        estimatedHours: est,
        materialCostCents: materialCents,
        toolsNeeded: splitJobChecklistLines(assignToolsNeeded),
        materialsNeeded: splitJobChecklistLines(assignMaterialsNeeded),
        materialsFulfillment: assignMaterialsFulfillment || undefined,
        materialPrepNotes: assignMaterialPrepNotes.trim(),
      };
      if (assignStatus === "upcoming") {
        payload.availabilityReview = assignSkipAvailabilityPrompt ? "cleared" : undefined;
      }
      if (portalId) {
        payload.clientPortalUserId = portalId;
      } else {
        const name = assignManualName.trim();
        const email = assignManualEmail.trim();
        if (!name || !email) {
          setAssignError("Select a portal client or enter manual name and email.");
          return;
        }
        payload.client = {
          name,
          email,
          phone: assignManualPhone.trim(),
          address: assignManualAddress.trim(),
        };
      }

      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignError(typeof data.error === "string" ? data.error : "Could not assign job.");
        return;
      }
      setAssignOpen(false);
      setAssignTitle("");
      setAssignScope("");
      setAssignNotes("");
      setAssignEstHours("");
      setAssignMaterialDollars("");
      setAssignToolsNeeded("");
      setAssignMaterialsNeeded("");
      setAssignMaterialsFulfillment("");
      setAssignMaterialPrepNotes("");
      setAssignSkipAvailabilityPrompt(false);
      setAssignManualName("");
      setAssignManualEmail("");
      setAssignManualPhone("");
      setAssignManualAddress("");
      await refreshOverview();
    } finally {
      setAssignSubmitting(false);
    }
  }

  const filteredJobs = useMemo(() => {
    if (tab === "pending_jobs") return jobs.filter((j) => j.status === "active");
    if (tab === "upcoming_jobs") return jobs.filter((j) => j.status === "upcoming");
    if (tab === "completed_jobs") return jobs.filter((j) => j.status === "completed");
    return [];
  }, [jobs, tab]);

  const formalProposalQueueJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.status === "upcoming" &&
          j.formalProposalIntake?.proposalId &&
          j.formalProposalIntake.portalUserId,
      ),
    [jobs],
  );

  const feedClients = useMemo(
    () =>
      Array.from(
        new Set(activityFeed.map((item) => item.clientName).filter((v): v is string => Boolean(v))),
      ).sort((a, b) => a.localeCompare(b)),
    [activityFeed],
  );

  const feedCarpenters = useMemo(
    () =>
      Array.from(
        new Set(
          activityFeed
            .map((item) => item.carpenterName)
            .filter((v): v is string => Boolean(v)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [activityFeed],
  );

  const filteredActivityFeed = useMemo(() => {
    const query = feedSearch.trim().toLowerCase();
    return activityFeed.filter((item) => {
      if (feedTypeFilter !== "all" && item.type !== feedTypeFilter) return false;
      if (feedClientFilter !== "all" && item.clientName !== feedClientFilter) return false;
      if (feedCarpenterFilter !== "all" && item.carpenterName !== feedCarpenterFilter) return false;
      if (!query) return true;
      const haystack = `${item.title} ${item.detail} ${item.clientName || ""} ${
        item.carpenterName || ""
      } ${item.jobTitle || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activityFeed, feedTypeFilter, feedClientFilter, feedCarpenterFilter, feedSearch]);

  const stats = useMemo(() => {
    const completed = jobs.filter((j) => j.status === "completed").length;
    const upcoming = jobs.filter((j) => j.status === "upcoming").length;
    return {
      completed,
      upcoming,
      clients: clients.length,
      carpenters: carpenters.length,
      totalJobs: jobs.length,
    };
  }, [jobs, clients.length, carpenters.length]);

  const paymentSummary = useMemo(() => {
    const clientsPaid = clients.flatMap((client) =>
      client.invoices
        .filter((invoice) => invoice.status === "paid")
        .map((invoice) => ({
          id: `client-paid-${client.id}-${invoice.id}`,
          name: client.fullName || client.username,
          email: client.email,
          projectName: invoice.projectName,
          amountCents: invoice.amountCents,
          issuedAt: invoice.issuedAt,
        })),
    );

    const clientsNeedToPay = clients.flatMap((client) =>
      client.invoices
        .filter((invoice) => invoice.status === "due")
        .map((invoice) => ({
          id: `client-due-${client.id}-${invoice.id}`,
          name: client.fullName || client.username,
          email: client.email,
          projectName: invoice.projectName,
          amountCents: invoice.amountCents,
          issuedAt: invoice.issuedAt,
        })),
    );

    const carpentersNeedToGetPaid = jobs.flatMap((job) =>
      job.payments
        .filter((payment) => payment.status === "scheduled")
        .map((payment) => ({
          id: `carpenter-due-${job.id}-${payment.id}`,
          name: job.carpenterFullName || job.carpenterUsername,
          email: "",
          jobTitle: job.title,
          amountCents: payment.amountCents,
          expectedAt: payment.expectedAt || "",
        })),
    );

    const carpentersPaid = jobs.flatMap((job) =>
      job.payments
        .filter((payment) => payment.status === "paid")
        .map((payment) => ({
          id: `carpenter-paid-${job.id}-${payment.id}`,
          name: job.carpenterFullName || job.carpenterUsername,
          email: "",
          jobTitle: job.title,
          amountCents: payment.amountCents,
          paidAt: payment.paidAt,
        })),
    );

    return {
      clientsPaid,
      clientsNeedToPay,
      carpentersNeedToGetPaid,
      carpentersPaid,
      totals: {
        clientsPaidCents: clientsPaid.reduce((sum, row) => sum + row.amountCents, 0),
        clientsNeedToPayCents: clientsNeedToPay.reduce((sum, row) => sum + row.amountCents, 0),
        carpentersNeedToGetPaidCents: carpentersNeedToGetPaid.reduce(
          (sum, row) => sum + row.amountCents,
          0,
        ),
        carpentersPaidCents: carpentersPaid.reduce((sum, row) => sum + row.amountCents, 0),
      },
    };
  }, [clients, jobs]);

  const quarterlyReport = useMemo<QuarterlyReport>(() => {
    const utcNow = new Date();
    const uy = utcNow.getUTCFullYear();
    const um = utcNow.getUTCMonth();
    const ud = utcNow.getUTCDate();

    let start: Date;
    let end: Date;
    let label: string;
    let periodYear: number;
    let periodQuarter: 1 | 2 | 3 | 4;

    if (reportRangeKind === "this_month") {
      start = new Date(Date.UTC(uy, um, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(uy, um + 1, 0, 23, 59, 59, 999));
      label = `This month (${uy}-${String(um + 1).padStart(2, "0")})`;
      periodYear = uy;
      periodQuarter = (Math.floor(um / 3) + 1) as 1 | 2 | 3 | 4;
    } else if (reportRangeKind === "last_month") {
      const lm = um === 0 ? 11 : um - 1;
      const ly = um === 0 ? uy - 1 : uy;
      start = new Date(Date.UTC(ly, lm, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(ly, lm + 1, 0, 23, 59, 59, 999));
      label = `Last month (${ly}-${String(lm + 1).padStart(2, "0")})`;
      periodYear = ly;
      periodQuarter = (Math.floor(lm / 3) + 1) as 1 | 2 | 3 | 4;
    } else if (reportRangeKind === "ytd") {
      start = new Date(Date.UTC(uy, 0, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(uy, um, ud, 23, 59, 59, 999));
      label = `${uy} year-to-date`;
      periodYear = uy;
      periodQuarter = (Math.floor(um / 3) + 1) as 1 | 2 | 3 | 4;
    } else if (reportRangeKind === "last_year") {
      const y = uy - 1;
      start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
      label = `${y} (full year)`;
      periodYear = y;
      periodQuarter = 4;
    } else {
      const quarterStartMonth = (reportQuarter - 1) * 3;
      start = new Date(Date.UTC(reportYear, quarterStartMonth, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(reportYear, quarterStartMonth + 3, 0, 23, 59, 59, 999));
      label = `${reportYear} Q${reportQuarter}`;
      periodYear = reportYear;
      periodQuarter = reportQuarter;
    }

    const inRange = (value?: string) => {
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      return date >= start && date <= end;
    };

    const invoices = clients.flatMap((client) =>
      client.invoices
        .filter((invoice) => inRange(invoice.issuedAt))
        .map((invoice) => ({
          id: `${client.id}-${invoice.id}`,
          clientName: client.fullName || client.username,
          clientEmail: client.email,
          projectName: invoice.projectName,
          amountCents: invoice.amountCents,
          status: invoice.status,
          issuedAt: invoice.issuedAt,
        })),
    );

    const receipts = jobs.flatMap((job) =>
      job.receipts
        .filter((receipt) => inRange(receipt.createdAt))
        .map((receipt) => ({
          id: `${job.id}-${receipt.id}`,
          carpenterName: job.carpenterFullName || job.carpenterUsername,
          clientName: job.client.name,
          jobTitle: job.title,
          title: receipt.title,
          amountCents: receipt.amountCents,
          createdAt: receipt.createdAt,
          imageDataUrl: receipt.imageDataUrl,
        })),
    );

    const payouts = jobs.flatMap((job) =>
      job.payments
        .filter((payment) => inRange(payment.paidAt) || inRange(payment.expectedAt))
        .map((payment) => ({
          id: `${job.id}-${payment.id}`,
          carpenterName: job.carpenterFullName || job.carpenterUsername,
          jobTitle: job.title,
          amountCents: payment.amountCents,
          status: payment.status,
          date: payment.status === "paid" ? payment.paidAt : payment.expectedAt || "",
        })),
    );

    const activity = activityFeed.filter((row) => inRange(row.createdAt));
    const jobsStarted = jobs.filter((job) => inRange(job.startDate));
    const jobsCompleted = activity.filter((row) => row.type === "job_status");

    return {
      period: {
        year: periodYear,
        quarter: periodQuarter,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label,
      },
      totals: {
        invoicesPaidCents: invoices
          .filter((row) => row.status === "paid")
          .reduce((sum, row) => sum + row.amountCents, 0),
        invoicesDueCents: invoices
          .filter((row) => row.status === "due")
          .reduce((sum, row) => sum + row.amountCents, 0),
        receiptsCents: receipts.reduce((sum, row) => sum + row.amountCents, 0),
        payoutsPaidCents: payouts
          .filter((row) => row.status === "paid")
          .reduce((sum, row) => sum + row.amountCents, 0),
        payoutsScheduledCents: payouts
          .filter((row) => row.status === "scheduled")
          .reduce((sum, row) => sum + row.amountCents, 0),
      },
      counts: {
        activityEvents: activity.length,
        invoices: invoices.length,
        receipts: receipts.length,
        payouts: payouts.length,
        jobsStarted: jobsStarted.length,
        jobsCompleted: jobsCompleted.length,
      },
      activity,
      invoices,
      receipts,
      payouts,
    };
  }, [reportRangeKind, reportYear, reportQuarter, clients, jobs, activityFeed]);

  function downloadQuarterlyReport() {
    const payload = {
      generatedAt: new Date().toISOString(),
      ...quarterlyReport,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `crm-report-${slugForReportFilename(quarterlyReport.period.label)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function patchJob(
    carpenterId: string,
    jobId: string,
    body: {
      status?: JobRow["status"];
      estimatedHours?: number;
      actualHours?: number;
      materialCostCents?: number;
      toolsNeeded?: string[];
      materialsNeeded?: string[];
      materialsFulfillment?: unknown;
      materialPrepNotes?: string;
      availabilityReview?: unknown;
    },
  ) {
    const res = await fetch("/api/admin/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carpenterId, jobId, ...body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(typeof data.error === "string" ? data.error : "Update failed.");
      return;
    }
    await refreshOverview();
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-200">
        <p className="text-sm tracking-wide text-zinc-400">Loading CRM…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight text-white">Level Up — Admin CRM</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in with the password configured in{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">ADMIN_PASSWORD</code>.
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none ring-violet-500/40 focus:border-violet-500 focus:ring-2"
              />
            </label>
            {loginError ? <p className="text-sm text-rose-400">{loginError}</p> : null}
            <button
              type="submit"
              disabled={loggingIn || !password.trim()}
              className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {loggingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              Internal
            </p>
            <h1 className="text-lg font-semibold text-white">Install CRM</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void refreshOverview()}
              disabled={overviewLoading}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {overviewLoading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAssignError("");
                setAssignOpen(true);
                if (!assignCarpenterId && carpenters[0]) setAssignCarpenterId(carpenters[0].id);
              }}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
            >
              Assign job
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-500 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {overviewError ? (
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {overviewError}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Portal clients" value={stats.clients} />
          <StatCard label="Carpenters" value={stats.carpenters} />
          <StatCard label="Total jobs" value={stats.totalJobs} accent="sky" />
          <StatCard label="Completed" value={stats.completed} accent="emerald" />
          <StatCard label="Upcoming" value={stats.upcoming} accent="sky" />
        </section>

        <nav className="flex gap-2 border-b border-zinc-800 pb-2">
          {(
            [
              ["feed", "Activity feed"],
              ["pending_jobs", "Pending jobs"],
              ["upcoming_jobs", "Upcoming jobs"],
              ["completed_jobs", "Completed jobs"],
              ["payments", "Payments"],
              ["clients", "Clients & AI planner"],
              ["carpenters", "Carpenters"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === key
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "feed" ? (
          <section className="space-y-3">
            <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 md:grid-cols-4">
              <select
                value={feedTypeFilter}
                onChange={(e) => setFeedTypeFilter(e.target.value as "all" | ActivityRow["type"])}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="all">All activity types</option>
                <option value="ai_planner">AI planner</option>
                <option value="job_assigned">Job assigned</option>
                <option value="job_status">Job status</option>
                <option value="receipt_uploaded">Receipt uploaded</option>
              </select>
              <select
                value={feedClientFilter}
                onChange={(e) => setFeedClientFilter(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="all">All clients</option>
                {feedClients.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={feedCarpenterFilter}
                onChange={(e) => setFeedCarpenterFilter(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="all">All carpenters</option>
                {feedCarpenters.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                value={feedSearch}
                onChange={(e) => setFeedSearch(e.target.value)}
                placeholder="Search activity…"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500"
              />
            </div>
            {filteredActivityFeed.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-sm text-zinc-500">
                No activity matches these filters.
              </div>
            ) : (
              filteredActivityFeed.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-zinc-300">{item.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                    {item.clientName ? <span>Client: {item.clientName}</span> : null}
                    {item.carpenterName ? <span>Carpenter: {item.carpenterName}</span> : null}
                    {item.jobTitle ? <span>Job: {item.jobTitle}</span> : null}
                  </div>
                </article>
              ))
            )}
          </section>
        ) : null}

        {tab === "pending_jobs" || tab === "upcoming_jobs" || tab === "completed_jobs" ? (
          <section className="space-y-6">
            {tab === "pending_jobs" ? (
              <div className="rounded-xl border border-violet-900/50 bg-violet-950/35 p-4">
                <h2 className="text-sm font-semibold text-white">
                  Formal proposals — admin review queue
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Created when a customer agrees to proceed and taps{" "}
                  <strong className="text-zinc-400">Request formal proposal</strong> in the AI planner.
                  Each row links the job photos and draft proposal — refine text under{" "}
                  <strong className="text-zinc-400">Clients → Formal proposals</strong> using{" "}
                  <strong className="text-zinc-400">Apply with AI</strong> (Gemini), then email the
                  customer.
                </p>
                {formalProposalQueueJobs.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">
                    No proposal-intake jobs yet — they appear here as{" "}
                    <span className="text-zinc-400">upcoming</span> CRM rows with space + concept
                    photos attached.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Job</th>
                          <th className="px-3 py-2 font-medium">Client</th>
                          <th className="px-3 py-2 font-medium">Phone</th>
                          <th className="px-3 py-2 font-medium">Site</th>
                          <th className="px-3 py-2 font-medium">Proposal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {formalProposalQueueJobs.map((job) => (
                          <tr key={job.id} className="align-top text-zinc-300">
                            <td className="px-3 py-2">
                              <p className="font-medium text-white">{job.title}</p>
                              <p className="text-xs text-zinc-500">
                                {new Date(job.startDate).toLocaleString()}
                              </p>
                              <p className="mt-1 text-[11px] text-zinc-500">
                                Intake · {(job.media ?? []).length} photo(s) on file
                              </p>
                            </td>
                            <td className="px-3 py-2">
                              <p className="text-zinc-200">{job.client.name}</p>
                              <p className="text-xs text-zinc-500">{job.client.email}</p>
                            </td>
                            <td className="px-3 py-2 text-xs">{job.client.phone || "—"}</td>
                            <td className="px-3 py-2 text-xs text-zinc-400">
                              {(job.client.address || "").trim() || "—"}
                            </td>
                            <td className="px-3 py-2">
                              {job.clientPortalUserId && job.formalProposalIntake ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTab("clients");
                                    setExpandedClientId(job.clientPortalUserId ?? null);
                                  }}
                                  className="rounded-lg border border-violet-700 bg-violet-950/80 px-3 py-1.5 text-[11px] font-medium text-violet-200 hover:bg-violet-900/80"
                                >
                                  Open client &amp; proposal
                                </button>
                              ) : (
                                <span className="text-xs text-zinc-500">—</span>
                              )}
                              {job.formalProposalIntake?.proposalId ? (
                                <p className="mt-2 font-mono text-[10px] text-zinc-600">
                                  {job.formalProposalIntake.proposalId.slice(0, 8)}…
                                </p>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "pending_jobs" ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <h2 className="text-sm font-semibold text-white">Carpenter availability</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Sorted lightest workload first (active jobs weighted heavier than upcoming). Use when
                  assigning work from <strong className="text-zinc-400">Assign job</strong>.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Carpenter</th>
                        <th className="px-3 py-2 font-medium">Calendar</th>
                        <th className="px-3 py-2 font-medium">Active</th>
                        <th className="px-3 py-2 font-medium">Upcoming</th>
                        <th className="px-3 py-2 font-medium">Availability notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {carpentersByWorkload.map((c) => (
                        <tr key={c.id} className="align-top text-zinc-300">
                          <td className="px-3 py-2">
                            <p className="font-medium text-white">{c.fullName || c.username}</p>
                            <p className="text-xs text-zinc-500">{c.email}</p>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {c.googleCalendarConnected ? (
                              <>
                                <span className="text-emerald-400">Connected</span>
                                {c.googleCalendarEmail ? (
                                  <p className="text-zinc-500">{c.googleCalendarEmail}</p>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-zinc-500">Not connected</span>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{c.activeJobCount}</td>
                          <td className="px-3 py-2 tabular-nums">{c.upcomingJobCount}</td>
                          <td className="px-3 py-2 text-xs text-zinc-500">
                            <span title={c.availabilityNotes || "No notes yet."}>
                              {(() => {
                                const n = (c.availabilityNotes || "").trim();
                                if (!n) return "—";
                                return `${n.slice(0, 140)}${n.length > 140 ? "…" : ""}`;
                              })()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {carpenters.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-500">No carpenter accounts yet.</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {tab === "pending_jobs"
                    ? "Pending jobs"
                    : tab === "upcoming_jobs"
                      ? "Upcoming jobs"
                      : "Completed jobs"}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {tab === "pending_jobs"
                    ? "Jobs marked active — crew assigned and work underway."
                    : tab === "upcoming_jobs"
                      ? "Scheduled before work starts. Confirm carpenter availability."
                      : "Finished visits — receipts, hours, and payouts."}
                </p>
              </div>

            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Carpenter</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Hours</th>
                    <th className="px-4 py-3 font-medium">Materials</th>
                    <th className="px-4 py-3 font-medium">Receipts</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredJobs.map((job) => (
                    <Fragment key={job.id}>
                      <tr className="hover:bg-zinc-900/60">
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedJobId((id) => (id === job.id ? null : job.id))
                            }
                            className="text-left font-medium text-white hover:text-violet-300"
                          >
                            {job.title}
                          </button>
                          <p className="mt-1 text-xs text-zinc-500">
                            {new Date(job.startDate).toLocaleString()}
                          </p>
                          {job.clientPortalUserId ? (
                            <p className="mt-1 text-xs text-violet-400">
                              Linked portal user{" "}
                              <span className="font-mono">{job.clientPortalUserId.slice(0, 8)}…</span>
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-zinc-300">
                          {job.carpenterFullName || job.carpenterUsername}
                          <p className="text-xs text-zinc-500">@{job.carpenterUsername}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-zinc-200">{job.client.name}</p>
                          <p className="text-xs text-zinc-500">{job.client.email}</p>
                        </td>
                        <td className="px-4 py-3 align-top text-zinc-300">
                          est {job.estimatedHours ?? "—"}
                          <br />
                          act {job.actualHours ?? "—"}
                        </td>
                        <td className="px-4 py-3 align-top text-zinc-300">
                          {job.materialCostCents != null
                            ? formatMoney(job.materialCostCents)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 align-top text-zinc-300">
                          {job.receiptCount} · {formatMoney(job.receiptsTotalCents)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select
                            value={job.status}
                            onChange={(e) =>
                              void patchJob(job.carpenterId, job.id, {
                                status: e.target.value as JobRow["status"],
                              })
                            }
                            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white"
                          >
                            <option value="upcoming">Upcoming</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                          </select>
                        </td>
                      </tr>
                      {expandedJobId === job.id ? (
                        <tr className="bg-zinc-950/80">
                          <td colSpan={7} className="space-y-4 px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-zinc-500">
                                  Scope
                                </h4>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
                                  {job.scopeOfWork}
                                </p>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-zinc-500">
                                  Design notes
                                </h4>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
                                  {job.designNotes}
                                </p>
                              </div>
                            </div>
                            {(job.media ?? []).length > 0 ? (
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-zinc-500">
                                  Photos (space &amp; agreed design)
                                </h4>
                                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {(job.media ?? []).map((m) => (
                                    <li
                                      key={m.id}
                                      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
                                    >
                                      {m.type === "image" && m.url.startsWith("data:") ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={m.url}
                                          alt={m.caption}
                                          className="max-h-52 w-full object-contain"
                                        />
                                      ) : (
                                        <p className="p-3 text-xs text-zinc-500">
                                          {m.caption || "Media"}
                                        </p>
                                      )}
                                      <p className="border-t border-zinc-800 px-2 py-1 text-[11px] text-zinc-500">
                                        {m.phase === "before"
                                          ? "Customer space"
                                          : m.phase === "after"
                                            ? "After"
                                            : "Agreed concept / reference"}
                                        {m.caption ? ` · ${m.caption}` : ""}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                              <h4 className="text-xs font-semibold uppercase text-zinc-500">
                                Materials logistics (carpenter prep)
                              </h4>
                              <p className="mt-1 text-sm text-zinc-300">
                                {job.materialsFulfillment === "pickup"
                                  ? "Carpenter pickup / supplier run"
                                  : job.materialsFulfillment === "on_site"
                                    ? "Staged on site / homeowner supplies"
                                    : job.materialsFulfillment === "mixed"
                                      ? "Mixed: some pickup, some on site"
                                      : "Not set"}
                              </p>
                              {(job.materialPrepNotes ?? "").trim() ? (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">
                                  {job.materialPrepNotes}
                                </p>
                              ) : (
                                <p className="mt-2 text-sm text-zinc-500">No prep notes on file.</p>
                              )}
                              {job.status === "upcoming" ? (
                                <p className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                                  Carpenter availability in mobile app:{" "}
                                  <span className="font-medium text-zinc-200">
                                    {job.availabilityReview === "cleared"
                                      ? "Acknowledged"
                                      : job.availabilityReview === "pending"
                                        ? "Pending review"
                                        : "Not set"}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-zinc-500">
                                  Tools for this job
                                </h4>
                                {(job.toolsNeeded ?? []).length === 0 ? (
                                  <p className="mt-1 text-sm text-zinc-500">None listed yet.</p>
                                ) : (
                                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-300">
                                    {(job.toolsNeeded ?? []).map((line, idx) => (
                                      <li key={`${idx}-${line}`}>{line}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-zinc-500">
                                  Materials for this job
                                </h4>
                                {(job.materialsNeeded ?? []).length === 0 ? (
                                  <p className="mt-1 text-sm text-zinc-500">None listed yet.</p>
                                ) : (
                                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-300">
                                    {(job.materialsNeeded ?? []).map((line, idx) => (
                                      <li key={`${idx}-${line}`}>{line}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                            <JobQuickEdit
                              job={job}
                              onSave={(patch) => void patchJob(job.carpenterId, job.id, patch)}
                            />
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-zinc-500">
                                Receipts ({job.receipts.length})
                              </h4>
                              {job.receipts.length === 0 ? (
                                <p className="mt-2 text-sm text-zinc-500">No receipts uploaded.</p>
                              ) : (
                                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {job.receipts.map((r) => (
                                    <li
                                      key={r.id}
                                      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
                                    >
                                      {r.imageDataUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={r.imageDataUrl}
                                          alt=""
                                          className="h-28 w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-28 items-center justify-center text-xs text-zinc-600">
                                          No image
                                        </div>
                                      )}
                                      <div className="p-2">
                                        <p className="text-sm font-medium text-white">{r.title}</p>
                                        <p className="text-xs text-zinc-400">
                                          {formatMoney(r.amountCents)}
                                        </p>
                                        <p className="text-xs text-zinc-600">
                                          {new Date(r.createdAt).toLocaleString()}
                                        </p>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            {job.status === "completed" ? (
                              <JobCompletionSocialPanel
                                carpenterId={job.carpenterId}
                                job={{
                                  id: job.id,
                                  status: job.status,
                                  title: job.title,
                                  startDate: job.startDate,
                                  clientName: job.client.name,
                                  carpenterUsername: job.carpenterUsername,
                                  carpenterFullName: job.carpenterFullName,
                                }}
                                facebookConfigured={socialIntegration?.facebook ?? false}
                                siteUrl={socialIntegration?.siteUrl}
                                brandName={socialIntegration?.brandName ?? "Our crew"}
                              />
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {filteredJobs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">No jobs in this view.</p>
              ) : null}
            </div>
            </div>
          </section>
        ) : null}

        {tab === "payments" ? (
          <section className="space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Quarterly report</p>
                  <p className="text-sm text-zinc-300">
                    Includes activity, invoices, receipts, and payouts for the selected range (UTC
                    boundaries). Current view:{" "}
                    <span className="font-medium text-white">{quarterlyReport.period.label}</span>
                  </p>
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                  <select
                    value={reportYear}
                    onChange={(e) => {
                      setReportYear(Number(e.target.value));
                      setReportRangeKind("quarter");
                    }}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  >
                    {Array.from({ length: 6 }).map((_, idx) => {
                      const year = new Date().getFullYear() - idx;
                      return (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    value={reportQuarter}
                    onChange={(e) => {
                      setReportQuarter(Number(e.target.value) as 1 | 2 | 3 | 4);
                      setReportRangeKind("quarter");
                    }}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  >
                    <option value={1}>Q1</option>
                    <option value={2}>Q2</option>
                    <option value={3}>Q3</option>
                    <option value={4}>Q4</option>
                  </select>
                  <button
                    type="button"
                    onClick={downloadQuarterlyReport}
                    className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
                  >
                    Download quarterly report
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="mr-1 self-center text-xs uppercase tracking-wider text-zinc-500">
                  Quick range
                </span>
                {(
                  [
                    ["this_month", "This month"],
                    ["last_month", "Last month"],
                    ["ytd", "Year to date"],
                    ["last_year", "Last year"],
                  ] as const
                ).map(([kind, text]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setReportRangeKind(kind)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium sm:text-sm ${
                      reportRangeKind === kind
                        ? "bg-violet-600 text-white"
                        : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    }`}
                  >
                    {text}
                  </button>
                ))}
                {([1, 2, 3, 4] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setReportQuarter(q);
                      setReportRangeKind("quarter");
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium sm:text-sm ${
                      reportRangeKind === "quarter" && reportQuarter === q
                        ? "bg-violet-600 text-white"
                        : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    }`}
                  >
                    Q{q}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Invoices (paid)" valueText={formatMoney(quarterlyReport.totals.invoicesPaidCents)} accent="emerald" />
                <StatCard label="Invoices (due)" valueText={formatMoney(quarterlyReport.totals.invoicesDueCents)} accent="amber" />
                <StatCard label="Receipts total" valueText={formatMoney(quarterlyReport.totals.receiptsCents)} />
                <StatCard label="Payouts paid" valueText={formatMoney(quarterlyReport.totals.payoutsPaidCents)} accent="emerald" />
                <StatCard label="Payouts scheduled" valueText={formatMoney(quarterlyReport.totals.payoutsScheduledCents)} accent="amber" />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                <p>Events: {quarterlyReport.counts.activityEvents}</p>
                <p>Invoices: {quarterlyReport.counts.invoices}</p>
                <p>Receipts: {quarterlyReport.counts.receipts}</p>
                <p>Payouts: {quarterlyReport.counts.payouts}</p>
                <p>Jobs started: {quarterlyReport.counts.jobsStarted}</p>
                <p>Jobs completed: {quarterlyReport.counts.jobsCompleted}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Clients paid"
                valueText={formatMoney(paymentSummary.totals.clientsPaidCents)}
                accent="emerald"
              />
              <StatCard
                label="Clients need to pay"
                valueText={formatMoney(paymentSummary.totals.clientsNeedToPayCents)}
                accent="amber"
              />
              <StatCard
                label="Carpenters need payout"
                valueText={formatMoney(paymentSummary.totals.carpentersNeedToGetPaidCents)}
                accent="amber"
              />
              <StatCard
                label="Carpenters paid"
                valueText={formatMoney(paymentSummary.totals.carpentersPaidCents)}
                accent="emerald"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <PaymentList
                title={`${quarterlyReport.period.label} · invoices`}
                emptyText="No invoices in this range."
                rows={quarterlyReport.invoices.map((row) => ({
                  id: row.id,
                  name: row.clientName,
                  subline: `${row.projectName} · ${row.status} · ${row.clientEmail}`,
                  amountCents: row.amountCents,
                  dateText: new Date(row.issuedAt).toLocaleDateString(),
                }))}
              />
              <PaymentList
                title={`${quarterlyReport.period.label} · receipts`}
                emptyText="No receipts in this range."
                rows={quarterlyReport.receipts.map((row) => ({
                  id: row.id,
                  name: row.title,
                  subline: `${row.jobTitle} · ${row.clientName} · ${row.carpenterName}`,
                  amountCents: row.amountCents,
                  dateText: new Date(row.createdAt).toLocaleDateString(),
                }))}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <PaymentList
                title="Who has paid (clients)"
                emptyText="No paid client invoices yet."
                rows={paymentSummary.clientsPaid.map((row) => ({
                  id: row.id,
                  name: row.name,
                  subline: `${row.projectName} · ${row.email}`,
                  amountCents: row.amountCents,
                  dateText: row.issuedAt ? new Date(row.issuedAt).toLocaleDateString() : "",
                }))}
              />
              <PaymentList
                title="Who needs to pay (clients)"
                emptyText="No outstanding client invoices."
                rows={paymentSummary.clientsNeedToPay.map((row) => ({
                  id: row.id,
                  name: row.name,
                  subline: `${row.projectName} · ${row.email}`,
                  amountCents: row.amountCents,
                  dateText: row.issuedAt ? new Date(row.issuedAt).toLocaleDateString() : "",
                }))}
              />
              <PaymentList
                title="Who needs to get paid (carpenters)"
                emptyText="No scheduled carpenter payouts."
                rows={paymentSummary.carpentersNeedToGetPaid.map((row) => ({
                  id: row.id,
                  name: row.name,
                  subline: row.jobTitle,
                  amountCents: row.amountCents,
                  dateText: row.expectedAt ? `Expected ${new Date(row.expectedAt).toLocaleDateString()}` : "",
                }))}
              />
              <PaymentList
                title="Who has been paid (carpenters)"
                emptyText="No paid carpenter payouts yet."
                rows={paymentSummary.carpentersPaid.map((row) => ({
                  id: row.id,
                  name: row.name,
                  subline: row.jobTitle,
                  amountCents: row.amountCents,
                  dateText: row.paidAt ? `Paid ${new Date(row.paidAt).toLocaleDateString()}` : "",
                }))}
              />
            </div>
          </section>
        ) : null}

        {tab === "clients" ? (
          <section className="space-y-3">
            {clients.map((c) => (
              <div
                key={c.id}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
              >
                <button
                  type="button"
                  onClick={() => setExpandedClientId((id) => (id === c.id ? null : c.id))}
                  className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-900/60"
                >
                  <div>
                    <p className="font-medium text-white">{c.fullName || c.username}</p>
                    <p className="text-sm text-zinc-400">{c.email}</p>
                    <p className="mt-1 text-xs text-zinc-500">{c.serviceAddress || "No address"}</p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <p>{c.ideas.length} saved projects</p>
                    <p>{c.invoices.length} invoices</p>
                    <p>{c.aiPlannerActivity.length} AI planner turns</p>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      Last login:{" "}
                      {c.lastLoginAt ? new Date(c.lastLoginAt).toLocaleString() : "Never recorded"}
                    </p>
                  </div>
                </button>
                {expandedClientId === c.id ? (
                  <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                    <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
                      <h4 className="text-xs font-semibold uppercase text-zinc-500">
                        Portal engagement
                      </h4>
                      <dl className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-zinc-500">Last login</dt>
                          <dd className="font-medium text-white">
                            {c.lastLoginAt
                              ? new Date(c.lastLoginAt).toLocaleString()
                              : "Never (tracked after next successful login)"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500">Saved projects</dt>
                          <dd className="font-medium text-white">{c.ideas.length}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500">Saved-projects tab opens</dt>
                          <dd className="font-medium text-white">
                            {c.portalAnalytics?.savedProjectsSectionOpens ?? 0}
                          </dd>
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            Counts when they open Saved projects in the client portal.
                          </p>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500">Space photo gallery opens</dt>
                          <dd className="font-medium text-white">
                            {c.portalAnalytics?.spacePhotosSectionOpens ?? 0}
                          </dd>
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            When they view that tab with space photos uploaded.
                          </p>
                        </div>
                      </dl>
                      <SignupLocationReadout log={c.signupLocationLog} />
                    </div>

                    <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
                      <h4 className="text-xs font-semibold uppercase text-zinc-500">
                        Outbound communications
                      </h4>
                      <p className="mt-1 text-xs text-zinc-500">
                        Log emails, texts, or in-app notices you send outside this CRM so the team has a
                        paper trail. Automated sends can be wired here later.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="block text-xs text-zinc-500 sm:col-span-1">
                          Channel
                          <select
                            value={commLogDraft.channel}
                            onChange={(e) =>
                              setCommLogDraft((d) => ({
                                ...d,
                                channel: e.target.value as "email" | "sms" | "app_notice",
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                          >
                            <option value="email">Email</option>
                            <option value="sms">SMS / text</option>
                            <option value="app_notice">In-app notice</option>
                          </select>
                        </label>
                        <label className="block text-xs text-zinc-500 sm:col-span-2">
                          Summary
                          <input
                            value={commLogDraft.summary}
                            onChange={(e) =>
                              setCommLogDraft((d) => ({ ...d, summary: e.target.value }))
                            }
                            placeholder="e.g. Sent booking confirmation + invoice PDF"
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="block text-xs text-zinc-500 sm:col-span-3">
                          Detail (optional)
                          <textarea
                            rows={2}
                            value={commLogDraft.detail}
                            onChange={(e) =>
                              setCommLogDraft((d) => ({ ...d, detail: e.target.value }))
                            }
                            placeholder="Short notes, template used, or thread subject…"
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        disabled={commLogBusy}
                        onClick={() => void submitPortalCommunication(c.id)}
                        className="mt-3 rounded-lg bg-zinc-700 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
                      >
                        {commLogBusy ? "Saving…" : "Log communication"}
                      </button>
                      {commLogFlash ? (
                        <p
                          className={`mt-2 text-xs ${
                            commLogFlash.type === "ok" ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {commLogFlash.message}
                        </p>
                      ) : null}
                      {(c.communicationLog ?? []).length === 0 ? (
                        <p className="mt-4 text-sm text-zinc-600">No logged communications yet.</p>
                      ) : (
                        <ul className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
                          {(c.communicationLog ?? []).map((row) => (
                            <li
                              key={row.id}
                              className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm"
                            >
                              <p className="text-xs text-zinc-500">
                                {new Date(row.sentAt).toLocaleString()} ·{" "}
                                <span className="text-violet-400">
                                  {communicationChannelLabel(row.channel)}
                                </span>
                                {row.recordedBy ? ` · ${row.recordedBy}` : null}
                              </p>
                              <p className="mt-1 font-medium text-zinc-200">{row.summary}</p>
                              {row.detail ? (
                                <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">
                                  {row.detail}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <WorkProposalsCrm
                      portalUserId={c.id}
                      proposals={c.workProposals ?? []}
                      onRefresh={() => void refreshOverview()}
                    />

                    <div>
                      <h4 className="text-xs font-semibold uppercase text-zinc-500">Project status</h4>
                      <p className="mt-1 text-sm text-zinc-300">
                        <span className="text-violet-400">{c.projectStatus.phase}</span> ·{" "}
                        {new Date(c.projectStatus.updatedAt).toLocaleString()}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">
                        {c.projectStatus.details}
                      </p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-zinc-500">
                          Saved ideas
                        </h4>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                          {c.ideas.length === 0 ? (
                            <li className="text-zinc-600">None yet.</li>
                          ) : (
                            c.ideas.map((idea) => (
                              <li key={idea.id}>• {idea.title}</li>
                            ))
                          )}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-zinc-500">Invoices</h4>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                          {c.invoices.length === 0 ? (
                            <li className="text-zinc-600">None.</li>
                          ) : (
                            c.invoices.map((inv) => (
                              <li key={inv.id}>
                                {inv.projectName} · {formatMoney(inv.amountCents)} · {inv.status}
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-4">
                      <h4 className="text-xs font-semibold uppercase text-zinc-500">
                        Phase 2 billing — balance invoice (Stripe)
                      </h4>
                      <p className="mt-1 text-xs text-zinc-500">
                        Creates a <span className="text-zinc-300">due</span> invoice. The customer sees
                        it in their portal with <span className="text-zinc-300">Pay with Stripe</span>.
                        Payment finalizes automatically via webhook (
                        <code className="rounded bg-zinc-900 px-1 text-[10px]">checkout.session.completed</code>
                        ).
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs text-zinc-500">
                          Invoice title
                          <input
                            value={balanceInvoiceDraft.title}
                            onChange={(e) =>
                              setBalanceInvoiceDraft((d) => ({ ...d, title: e.target.value }))
                            }
                            placeholder="e.g. Mudroom built-in — labour & materials"
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="block text-xs text-zinc-500">
                          Amount (CAD)
                          <input
                            type="number"
                            min={0.01}
                            step={0.01}
                            value={balanceInvoiceDraft.dollars}
                            onChange={(e) =>
                              setBalanceInvoiceDraft((d) => ({ ...d, dollars: e.target.value }))
                            }
                            placeholder="2500.00"
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="block text-xs text-zinc-500 sm:col-span-2">
                          Scope / line items (shown to customer &amp; on PDF)
                          <textarea
                            rows={3}
                            value={balanceInvoiceDraft.notes}
                            onChange={(e) =>
                              setBalanceInvoiceDraft((d) => ({ ...d, notes: e.target.value }))
                            }
                            placeholder="Labour 12h @ $75… Materials: MDF, hardware…"
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        disabled={balanceInvoiceSubmitting}
                        onClick={() => void submitBalanceInvoice(c.id)}
                        className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                      >
                        {balanceInvoiceSubmitting ? "Creating…" : "Create balance invoice"}
                      </button>
                      {balanceInvoiceFlash ? (
                        <p
                          className={`mt-2 text-xs ${
                            balanceInvoiceFlash.type === "ok" ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {balanceInvoiceFlash.message}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase text-zinc-500">
                        AI planner activity
                      </h4>
                      {c.aiPlannerActivity.length === 0 ? (
                        <p className="mt-2 text-sm text-zinc-600">
                          No logged sessions yet (only logged when the client uses the planner while
                          signed in).
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-3">
                          {c.aiPlannerActivity.map((row) => (
                            <li
                              key={row.id}
                              className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm"
                            >
                              <p className="text-xs text-zinc-500">
                                {new Date(row.createdAt).toLocaleString()} · {row.imageCount} image
                                {row.imageCount === 1 ? "" : "s"}
                              </p>
                              <p className="mt-2 text-zinc-300">
                                <span className="text-zinc-500">Prompt:</span> {row.promptPreview}
                              </p>
                              <p className="mt-2 text-zinc-400">
                                <span className="text-zinc-500">Reply:</span> {row.replyPreview}
                              </p>
                              {row.conceptImages && row.conceptImages.length > 0 ? (
                                <div className="mt-3">
                                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                                    AI concept visuals (this turn)
                                  </p>
                                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {row.conceptImages.map((img, idx) => (
                                      // eslint-disable-next-line @next/next/no-img-element -- admin CRM data URLs from planner archive
                                      <img
                                        key={`${row.id}-viz-${idx}`}
                                        src={img.dataUrl}
                                        alt={`Concept ${idx + 1}`}
                                        className="max-h-52 w-full rounded-lg border border-zinc-700 bg-black/20 object-contain"
                                      />
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-600">
                                {row.intakeSummary}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-lg border border-rose-900/50 bg-rose-950/25 p-4">
                      <h4 className="text-xs font-semibold uppercase text-rose-400">
                        Danger zone
                      </h4>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                        Permanently delete this customer&apos;s portal account from the database:
                        login credentials (password hash), profile data, saved ideas, photos,
                        uploads, portal invoices, AI planner history, and communication log. A
                        confirmation dialog opens so this isn&apos;t triggered by mistake.
                      </p>
                      <button
                        type="button"
                        disabled={deleteClientBusyId === c.id}
                        onClick={() => setPortalDeleteConfirmClient(c)}
                        className="mt-3 rounded-lg border border-rose-600 bg-rose-950/90 px-4 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete customer from system…
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {clients.length === 0 ? (
              <p className="text-sm text-zinc-500">No portal accounts yet.</p>
            ) : null}
          </section>
        ) : null}

        {tab === "carpenters" ? (
          <section className="space-y-3">
            {carpenters.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-4"
              >
                <p className="font-medium text-white">{c.fullName || c.username}</p>
                <p className="text-sm text-zinc-400">{c.email}</p>
                <p className="text-sm text-zinc-500">{c.phone || "No phone"}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {c.jobs.length} job{c.jobs.length === 1 ? "" : "s"} on record
                </p>
                <SignupLocationReadout log={c.signupLocationLog} />
              </div>
            ))}
            {carpenters.length === 0 ? (
              <p className="text-sm text-zinc-500">No carpenter accounts yet.</p>
            ) : null}
          </section>
        ) : null}
      </main>

      {assignOpen ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-white">Assign job to carpenter</h2>
            <form onSubmit={submitAssign} className="mt-4 space-y-4">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Carpenter
                <select
                  required
                  value={assignCarpenterId}
                  onChange={(e) => setAssignCarpenterId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select…</option>
                  {carpenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName || c.username}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Portal client (optional — fills client block from account)
                <select
                  value={assignClientPortalId}
                  onChange={(e) => setAssignClientPortalId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">Manual client below</option>
                  {clients.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.fullName || cl.username} ({cl.email})
                    </option>
                  ))}
                </select>
              </label>
              {!assignClientPortalId ? (
                <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-xs text-zinc-500">
                    Manual client (required when no portal account is selected)
                  </p>
                  <input
                    required={!assignClientPortalId}
                    placeholder="Client name"
                    value={assignManualName}
                    onChange={(e) => setAssignManualName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                  />
                  <input
                    required={!assignClientPortalId}
                    type="email"
                    placeholder="Email"
                    value={assignManualEmail}
                    onChange={(e) => setAssignManualEmail(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                  />
                  <input
                    placeholder="Phone (optional)"
                    value={assignManualPhone}
                    onChange={(e) => setAssignManualPhone(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                  />
                  <input
                    placeholder="Address (optional)"
                    value={assignManualAddress}
                    onChange={(e) => setAssignManualAddress(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                  />
                </div>
              ) : null}
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Job title
                <input
                  required
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Scope of work
                <textarea
                  required
                  rows={3}
                  value={assignScope}
                  onChange={(e) => setAssignScope(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Design notes
                <textarea
                  rows={2}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Tools needed (one per line)
                <textarea
                  rows={4}
                  value={assignToolsNeeded}
                  onChange={(e) => setAssignToolsNeeded(e.target.value)}
                  placeholder="One tool per line (e.g. miter saw, finish nailer)"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Materials needed (one per line)
                <textarea
                  rows={4}
                  value={assignMaterialsNeeded}
                  onChange={(e) => setAssignMaterialsNeeded(e.target.value)}
                  placeholder="One material per line (e.g. primed MDF, casing stock)"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Materials fulfillment (shown to carpenter)
                <select
                  value={assignMaterialsFulfillment}
                  onChange={(e) =>
                    setAssignMaterialsFulfillment(
                      e.target.value as "" | "pickup" | "on_site" | "mixed",
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">Not set</option>
                  <option value="pickup">Carpenter pickup / supplier run</option>
                  <option value="on_site">Staged on site</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Material prep notes (supplier, bay, staging location…)
                <textarea
                  rows={3}
                  value={assignMaterialPrepNotes}
                  onChange={(e) => setAssignMaterialPrepNotes(e.target.value)}
                  placeholder="e.g. Pick up MDF at Building Depot bay 4 — crown molding drop-ships Tuesday AM."
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Est. hours
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={assignEstHours}
                    onChange={(e) => setAssignEstHours(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Materials (USD)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={assignMaterialDollars}
                    onChange={(e) => setAssignMaterialDollars(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Initial status
                <select
                  value={assignStatus}
                  onChange={(e) => {
                    const next = e.target.value as JobRow["status"];
                    setAssignStatus(next);
                    if (next !== "upcoming") setAssignSkipAvailabilityPrompt(false);
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="active">Active</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              {assignStatus === "upcoming" ? (
                <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={assignSkipAvailabilityPrompt}
                    onChange={(e) => setAssignSkipAvailabilityPrompt(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-600"
                  />
                  <span>
                    Do not require carpenter availability confirmation (skip &quot;pending review&quot;
                    in their app).
                  </span>
                </label>
              ) : null}
              {assignError ? <p className="text-sm text-rose-400">{assignError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {assignSubmitting ? "Saving…" : "Create job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {portalDeleteConfirmClient ? (
        <div className="fixed inset-0 z-[30] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="portal-delete-title"
            className="w-full max-w-md rounded-2xl border border-rose-900/60 bg-zinc-900 p-6 shadow-2xl"
          >
            <h2
              id="portal-delete-title"
              className="text-lg font-semibold text-rose-100"
            >
              Delete customer permanently?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              You are about to remove{" "}
              <span className="font-semibold text-white">
                {portalDeleteConfirmClient.fullName ||
                  portalDeleteConfirmClient.username}
              </span>{" "}
              (<span className="text-zinc-200">{portalDeleteConfirmClient.email}</span>)
              from the system.
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs leading-relaxed text-zinc-400">
              <li>Portal login and password are erased (database row deleted).</li>
              <li>
                All portal data goes with it: ideas, photos, invoices shown in the portal, AI planner
                activity, communication log.
              </li>
              <li>
                CRM booking rows tied only to this login may be removed; carpenter jobs stay, unlinked
                from this account.
              </li>
              <li>This cannot be undone.</li>
            </ul>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deleteClientBusyId === portalDeleteConfirmClient.id}
                onClick={() => setPortalDeleteConfirmClient(null)}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteClientBusyId === portalDeleteConfirmClient.id}
                onClick={() => void executeConfirmedPortalDelete()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteClientBusyId === portalDeleteConfirmClient.id
                  ? "Deleting…"
                  : "Yes, delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard(props: {
  label: string;
  value?: number;
  valueText?: string;
  accent?: "amber" | "emerald" | "sky";
  valuePrefix?: string;
}) {
  const accent =
    props.accent === "amber"
      ? "text-amber-400"
      : props.accent === "emerald"
        ? "text-emerald-400"
        : props.accent === "sky"
          ? "text-sky-400"
          : "text-white";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{props.label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>
        {props.valueText ?? `${props.valuePrefix || ""}${props.value ?? 0}`}
      </p>
    </div>
  );
}

function PaymentList(props: {
  title: string;
  emptyText: string;
  rows: Array<{
    id: string;
    name: string;
    subline: string;
    amountCents: number;
    dateText?: string;
  }>;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-white">{props.title}</h3>
      {props.rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{props.emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {props.rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-zinc-200">{row.name}</p>
                <p className="text-xs text-zinc-500">{row.subline}</p>
                {row.dateText ? <p className="text-xs text-zinc-600">{row.dateText}</p> : null}
              </div>
              <p className="text-sm font-semibold text-zinc-100">{formatMoney(row.amountCents)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobQuickEdit(props: {
  job: JobRow;
  onSave: (patch: {
    estimatedHours?: number;
    actualHours?: number;
    materialCostCents?: number;
    toolsNeeded?: string[];
    materialsNeeded?: string[];
    materialsFulfillment?: unknown;
    materialPrepNotes?: string;
    availabilityReview?: unknown;
  }) => void;
}) {
  const { job } = props;
  const [est, setEst] = useState(job.estimatedHours?.toString() ?? "");
  const [act, setAct] = useState(job.actualHours?.toString() ?? "");
  const [mat, setMat] = useState(
    job.materialCostCents != null ? (job.materialCostCents / 100).toFixed(2) : "",
  );
  const [toolsText, setToolsText] = useState((job.toolsNeeded ?? []).join("\n"));
  const [materialsText, setMaterialsText] = useState((job.materialsNeeded ?? []).join("\n"));
  const [materialsFulfillment, setMaterialsFulfillment] = useState<
    "" | "pickup" | "on_site" | "mixed"
  >(job.materialsFulfillment ?? "");
  const [materialPrepNotes, setMaterialPrepNotes] = useState(job.materialPrepNotes ?? "");
  const [availabilityReview, setAvailabilityReview] = useState<"pending" | "cleared">(
    job.availabilityReview === "cleared" ? "cleared" : "pending",
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEst(job.estimatedHours?.toString() ?? "");
      setAct(job.actualHours?.toString() ?? "");
      setMat(job.materialCostCents != null ? (job.materialCostCents / 100).toFixed(2) : "");
      setToolsText((job.toolsNeeded ?? []).join("\n"));
      setMaterialsText((job.materialsNeeded ?? []).join("\n"));
      setMaterialsFulfillment(job.materialsFulfillment ?? "");
      setMaterialPrepNotes(job.materialPrepNotes ?? "");
      setAvailabilityReview(job.availabilityReview === "cleared" ? "cleared" : "pending");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    job.estimatedHours,
    job.actualHours,
    job.materialCostCents,
    job.toolsNeeded,
    job.materialsNeeded,
    job.materialsFulfillment,
    job.materialPrepNotes,
    job.availabilityReview,
    job.status,
  ]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h4 className="text-xs font-semibold uppercase text-zinc-500">CRM fields &amp; job checklist</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-500">
          Est. hours
          <input
            type="number"
            min={0}
            step={0.25}
            value={est}
            onChange={(e) => setEst(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Actual hours
          <input
            type="number"
            min={0}
            step={0.25}
            value={act}
            onChange={(e) => setAct(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Materials (USD)
          <input
            type="number"
            min={0}
            step={0.01}
            value={mat}
            onChange={(e) => setMat(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
          />
        </label>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block text-xs text-zinc-500">
          Tools needed (one per line)
          <textarea
            rows={5}
            value={toolsText}
            onChange={(e) => setToolsText(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Materials needed (one per line)
          <textarea
            rows={5}
            value={materialsText}
            onChange={(e) => setMaterialsText(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>
      {job.status === "upcoming" ? (
        <div className="mt-4">
          <label className="block text-xs text-zinc-500">
            Carpenter availability (mobile app)
            <select
              value={availabilityReview}
              onChange={(e) =>
                setAvailabilityReview(e.target.value as "pending" | "cleared")
              }
              className="mt-1 w-full max-w-md rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            >
              <option value="pending">Pending review</option>
              <option value="cleared">Acknowledged</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block text-xs text-zinc-500">
          Materials fulfillment
          <select
            value={materialsFulfillment}
            onChange={(e) =>
              setMaterialsFulfillment(e.target.value as "" | "pickup" | "on_site" | "mixed")
            }
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Not set</option>
            <option value="pickup">Carpenter pickup</option>
            <option value="on_site">On site</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label className="block text-xs text-zinc-500 lg:col-span-2">
          Prep notes
          <textarea
            rows={3}
            value={materialPrepNotes}
            onChange={(e) => setMaterialPrepNotes(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          const estimatedHours = est.trim() === "" ? undefined : Number.parseFloat(est);
          const actualHours = act.trim() === "" ? undefined : Number.parseFloat(act);
          const materialCostCents =
            mat.trim() === "" ? undefined : Math.round(Number.parseFloat(mat) * 100);
          if (est.trim() !== "" && !Number.isFinite(estimatedHours)) return;
          if (act.trim() !== "" && !Number.isFinite(actualHours)) return;
          if (mat.trim() !== "" && !Number.isFinite(materialCostCents)) return;
          props.onSave({
            estimatedHours,
            actualHours,
            materialCostCents,
            toolsNeeded: splitJobChecklistLines(toolsText),
            materialsNeeded: splitJobChecklistLines(materialsText),
            materialsFulfillment: materialsFulfillment || "",
            materialPrepNotes: materialPrepNotes.trim(),
            ...(props.job.status === "upcoming"
              ? { availabilityReview }
              : {}),
          });
        }}
        className="mt-3 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
      >
        Save hours, materials &amp; checklist
      </button>
    </div>
  );
}
