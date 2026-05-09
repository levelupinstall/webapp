"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  CARPENTER_PROFILE_DETAIL_MIN_CHARS,
  validateCarpenterEmergencyAndSkills,
} from "@/lib/carpenter-profile-rules";
import type { CarpenterCalendarDay } from "@/lib/carpenter-calendar-types";
import CarpenterScheduleCalendar from "./carpenter-schedule-calendar";

type GeoPing = { at: string; lat: number; lng: number; accuracyM?: number };

type WorkSession = { id: string; clockIn: GeoPing; clockOut?: GeoPing };

type JobIssueReport = {
  id: string;
  notes: string;
  photos: { id: string; url: string; caption: string; createdAt: string }[];
  createdAt: string;
};

type JobMediaPhase = "general" | "before" | "after";

type Job = {
  id: string;
  title: string;
  status: "upcoming" | "completed" | "active";
  startDate: string;
  designNotes: string;
  scopeOfWork: string;
  client: { name: string; email: string; phone: string; address: string };
  comments: string[];
  media: {
    id: string;
    type: "image" | "video";
    url: string;
    caption: string;
    phase?: JobMediaPhase;
  }[];
  receipts: { id: string; title: string; amountCents: number; imageDataUrl: string }[];
  messages: { id: string; sender: "carpenter" | "client"; text: string }[];
  estimatedHours?: number;
  actualHours?: number;
  clientPortalUserId?: string;
  workSessions?: WorkSession[];
  issueReports?: JobIssueReport[];
  toolsNeeded?: string[];
  materialsNeeded?: string[];
  materialsFulfillment?: "pickup" | "on_site" | "mixed";
  materialPrepNotes?: string;
  payments?: {
    id: string;
    amountCents: number;
    paidAt: string;
    expectedAt?: string;
    status: "paid" | "scheduled";
  }[];
  availabilityReview?: "pending" | "cleared";
};

function MaterialsPrepCard(props: {
  fulfillment?: Job["materialsFulfillment"];
  notes?: string;
}) {
  const notes = (props.notes ?? "").trim();
  const f = props.fulfillment;
  let title = "Materials logistics";
  let summary =
    "Dispatch has not marked pickup vs on-site yet. Check with the office if you are unsure.";
  let ringClass = "border-[#dcc6fb] bg-[#faf8ff]";

  if (f === "pickup") {
    title = "Plan a pickup before the visit";
    summary =
      "Expect to pick up lumber, sheet goods, or supplier orders yourself or coordinate through Level Up. Cross-check against the materials list.";
    ringClass = "border-[#fbbf24]/70 bg-[#fffbeb]";
  } else if (f === "on_site") {
    title = "Materials should be on site";
    summary =
      "Homeowner or dispatch staged supplies at the address — verify dimensions and quantities still match scope before cutting.";
    ringClass = "border-[#34d399]/60 bg-[#ecfdf5]";
  } else if (f === "mixed") {
    title = "Mixed pickup and on-site materials";
    summary =
      "Some items need pickup; others are already at the jobsite (or arriving separately). Read the notes carefully.";
    ringClass = "border-[#38bdf8]/70 bg-[#f0f9ff]";
  }

  return (
    <div className={`rounded-2xl border p-4 ${ringClass}`}>
      <p className="text-sm font-semibold text-[#230f35]">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-[#4d2e70]">{summary}</p>
      {notes ? (
        <div className="mt-3 rounded-xl border border-[#e8d9ff] bg-white/80 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">Details from dispatch</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#31184a]">{notes}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#6a4a8f]">
          No extra logistics notes — confirm with dispatch if the materials list looks incomplete.
        </p>
      )}
    </div>
  );
}

function materialsFulfillmentHint(f?: Job["materialsFulfillment"]) {
  switch (f) {
    case "pickup":
      return "Materials: plan pickup";
    case "on_site":
      return "Materials: on site";
    case "mixed":
      return "Materials: pickup + on site";
    default:
      return "Materials: tap for details";
  }
}

function JobChecklistSection(props: { tools: string[]; materials: string[] }) {
  const tools = props.tools ?? [];
  const materials = props.materials ?? [];
  if (tools.length === 0 && materials.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#dcc6fb] bg-[#faf8ff] p-4">
        <p className="text-sm font-semibold text-[#2f1748]">Job checklist</p>
        <p className="mt-1 text-sm text-[#6a4a8f]">
          No tools or materials list yet for this job. The office adds these when the booking is set up in CRM so you can prep your truck and supplies.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[#c9a5f1]/50 bg-gradient-to-br from-[#faf8ff] to-[#f3ebff] p-4">
      <p className="text-sm font-semibold text-[#31184a]">Bring &amp; prep for this job</p>
      <p className="mt-1 text-xs text-[#6a4a8f]">
        Checklist from the booking — verify stock before you head out.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">Tools needed</h4>
          {tools.length === 0 ? (
            <p className="mt-2 text-sm text-[#6a4a8f]">None listed.</p>
          ) : (
            <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-[#4d2e70]">
              {tools.map((item, idx) => (
                <li key={`${idx}-${item}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">Materials needed</h4>
          {materials.length === 0 ? (
            <p className="mt-2 text-sm text-[#6a4a8f]">None listed.</p>
          ) : (
            <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-[#4d2e70]">
              {materials.map((item, idx) => (
                <li key={`${idx}-${item}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

type ClientJobContext = {
  linked: boolean;
  message?: string;
  clientName?: string;
  clientEmail?: string;
  serviceAddress?: string;
  ideas: { id: string; title: string; notes: string; createdAt: string }[];
  aiPlannerActivity: {
    id: string;
    createdAt: string;
    promptPreview: string;
    replyPreview: string;
    intakeSummary: string;
    imageCount: number;
  }[];
  spacePhotos: { id: string; type: "image" | "video"; url: string; caption: string; uploadedAt: string }[];
};

function osmEmbedSrc(lat: number, lng: number) {
  const pad = 0.012;
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function requestGeoPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 25_000,
      maximumAge: 0,
    });
  });
}

type CarpenterUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactAlternatePhone: string;
  skillsSummary: string;
  toolsInventory: string;
  hasLiabilityInsurance: boolean;
  liabilityInsuranceDetails: string;
  hasWsib: boolean;
  wsibDetails: string;
  availabilityNotes: string;
  availabilityCalendar?: CarpenterCalendarDay[];
  googleCalendarConnected: boolean;
  googleCalendarEmail: string;
  profilePictureDataUrl: string;
  jobs: Job[];
};

export default function CarpenterApp() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<CarpenterUser | null>(null);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hasLiabilityInsurance, setHasLiabilityInsurance] = useState(false);
  const [liabilityInsuranceDetails, setLiabilityInsuranceDetails] = useState("");
  const [hasWsib, setHasWsib] = useState(false);
  const [wsibDetails, setWsibDetails] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactAlternatePhone, setEmergencyContactAlternatePhone] = useState("");
  const [skillsSummary, setSkillsSummary] = useState("");
  const [toolsInventory, setToolsInventory] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [availabilityNotes, setAvailabilityNotes] = useState("");
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState("");
  const [activeSection, setActiveSection] = useState<
    "current" | "upcoming" | "past" | "earnings" | "schedule" | "profile"
  >("current");
  const [expandedUpcomingJobId, setExpandedUpcomingJobId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaCaption, setMediaCaption] = useState("");
  const [receiptTitle, setReceiptTitle] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptImage, setReceiptImage] = useState("");
  const [clientJobContext, setClientJobContext] = useState<ClientJobContext | null>(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [siteUploadBusy, setSiteUploadBusy] = useState(false);
  const [issueNotes, setIssueNotes] = useState("");
  const [issueBusy, setIssueBusy] = useState(false);
  const [fieldLog, setFieldLog] = useState<string | null>(null);
  const [availabilityBusyJobId, setAvailabilityBusyJobId] = useState<string | null>(null);
  const [availabilityNotice, setAvailabilityNotice] = useState<string | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [calendarDays, setCalendarDays] = useState<CarpenterCalendarDay[]>([]);
  const calendarOwnerIdRef = useRef<string | null>(null);
  const [payoutSummary, setPayoutSummary] = useState<{
    weekCents: number;
    monthCents: number;
    yearCents: number;
    lifetimeCents: number;
    scheduledCents: number;
    nextExpectedPayment: string | null;
  } | null>(null);

  const jobs = user?.jobs || [];
  const resolvedJobId = activeJobId || jobs[0]?.id || "";
  const activeJob = jobs.find((job) => job.id === resolvedJobId) || jobs[0];
  const upcomingJobs = jobs.filter((job) => job.status === "upcoming" || job.status === "active");
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const currentJobs = jobs.filter((job) => job.status === "active");

  const loadMe = useCallback(async () => {
    const response = await fetch("/api/carpenter/me");
    if (!response.ok) return;
    const data = (await response.json()) as { user: CarpenterUser };
    setUser(data.user);
    setAvailabilityNotes(data.user.availabilityNotes || "");
  }, []);

  const loadPayouts = useCallback(async () => {
    const response = await fetch("/api/carpenter/payouts");
    if (!response.ok) return;
    const data = (await response.json()) as { summary: typeof payoutSummary };
    setPayoutSummary(data.summary || null);
  }, []);

  const confirmJobAvailability = useCallback(
    async (jobId: string) => {
      setAvailabilityBusyJobId(jobId);
      setAvailabilityNotice(null);
      setError(null);
      try {
        const res = await fetch("/api/carpenter/job-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, confirmAvailability: true }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Could not update availability.");
        await loadMe();
        setAvailabilityNotice("Thanks — availability confirmed for this job.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed.");
      } finally {
        setAvailabilityBusyJobId(null);
      }
    },
    [loadMe],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMe();
      void loadPayouts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMe, loadPayouts]);

  useEffect(() => {
    if (!user) {
      calendarOwnerIdRef.current = null;
      setCalendarDays([]);
      return;
    }
    if (calendarOwnerIdRef.current !== user.id) {
      calendarOwnerIdRef.current = user.id;
      setCalendarDays(user.availabilityCalendar ?? []);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      setFullName(user.fullName || "");
      setAvatarDataUrl(user.profilePictureDataUrl || "");
      setPhone(user.phone || "");
      setEmergencyContactName(user.emergencyContactName || "");
      setEmergencyContactRelationship(user.emergencyContactRelationship || "");
      setEmergencyContactPhone(user.emergencyContactPhone || "");
      setEmergencyContactAlternatePhone(user.emergencyContactAlternatePhone || "");
      setSkillsSummary(user.skillsSummary || "");
      setToolsInventory(user.toolsInventory || "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (activeSection !== "upcoming") {
      const timer = window.setTimeout(() => {
        setExpandedUpcomingJobId(null);
        setAvailabilityNotice(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [activeSection]);

  useEffect(() => {
    let cancelled = false;

    if (!activeJob?.id || activeSection !== "current") {
      const clearTimer = window.setTimeout(() => {
        if (!cancelled) setClientJobContext(null);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(clearTimer);
      };
    }

    void (async () => {
      const response = await fetch(
        `/api/carpenter/job-client-context?jobId=${encodeURIComponent(activeJob.id)}`,
      );
      const data = (await response.json()) as ClientJobContext | { error?: string };
      if (cancelled) return;
      if (!response.ok || !("linked" in data)) {
        setClientJobContext(null);
        return;
      }
      setClientJobContext(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeJob?.id, activeSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => setFieldLog(null), 0);
    return () => window.clearTimeout(timer);
  }, [resolvedJobId]);

  useEffect(() => {
    setForgotPasswordOpen(false);
    setForgotMessage(null);
    setForgotError(null);
    setForgotEmail("");
  }, [mode]);

  async function handleForgotPassword() {
    setForgotError(null);
    setForgotMessage(null);
    const em = forgotEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setForgotError("Enter the email address on your carpenter account.");
      return;
    }
    setForgotBusy(true);
    try {
      const response = await fetch("/api/carpenter/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not send reset email.");
      }
      setForgotMessage(
        data.message ??
          "If an account exists for that email, we sent instructions to reset your password.",
      );
      setForgotEmail("");
    } catch (forgotErr) {
      setForgotError(
        forgotErr instanceof Error ? forgotErr.message : "Could not send reset email.",
      );
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "login" && forgotPasswordOpen) {
      return;
    }
    if (mode === "register") {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setError("Please enter your full name.");
        return;
      }
      if (!email.trim() || !phone.trim()) {
        setError("Email and phone number are required.");
        return;
      }
      if (hasLiabilityInsurance && !liabilityInsuranceDetails.trim()) {
        setError("Enter your liability insurance details.");
        return;
      }
      if (hasWsib && !wsibDetails.trim()) {
        setError("Enter your WSIB coverage details.");
        return;
      }
      const extErr = validateCarpenterEmergencyAndSkills({
        emergencyContactName,
        emergencyContactRelationship,
        emergencyContactPhone,
        skillsSummary,
        toolsInventory,
      });
      if (extErr) {
        setError(extErr);
        return;
      }
    }

    const endpoint = mode === "login" ? "/api/carpenter/login" : "/api/carpenter/register";
    const payload =
      mode === "login"
        ? { email: email.trim(), password }
        : {
            password,
            fullName,
            email: email.trim(),
            phone: phone.trim(),
            hasLiabilityInsurance,
            liabilityInsuranceDetails: hasLiabilityInsurance
              ? liabilityInsuranceDetails.trim()
              : "",
            hasWsib,
            wsibDetails: hasWsib ? wsibDetails.trim() : "",
            profilePictureDataUrl: avatarDataUrl,
            emergencyContactName: emergencyContactName.trim(),
            emergencyContactRelationship: emergencyContactRelationship.trim(),
            emergencyContactPhone: emergencyContactPhone.trim(),
            emergencyContactAlternatePhone: emergencyContactAlternatePhone.trim(),
            skillsSummary: skillsSummary.trim(),
            toolsInventory: toolsInventory.trim(),
          };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not authenticate.");
      return;
    }
    await loadMe();
    await loadPayouts();
  }

  async function handleLogout() {
    await fetch("/api/carpenter/logout", { method: "POST" });
    setUser(null);
    setEmail("");
    setPassword("");
  }

  async function handleUpdateJob(event: FormEvent) {
    event.preventDefault();
    if (!activeJob) return;
    await fetch("/api/carpenter/job-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: activeJob.id,
        comment,
        message,
        mediaType,
        mediaUrl,
        mediaCaption,
        receiptTitle,
        receiptAmountCents: receiptAmount ? Number(Math.round(Number(receiptAmount) * 100)) : undefined,
        receiptImageDataUrl: receiptImage,
      }),
    });
    setComment("");
    setMessage("");
    setMediaUrl("");
    setMediaCaption("");
    setReceiptTitle("");
    setReceiptAmount("");
    setReceiptImage("");
    await loadMe();
    await loadPayouts();
  }

  async function handleClock(action: "in" | "out") {
    if (!activeJob) return;
    setFieldLog(null);
    setClockLoading(true);
    try {
      const pos = await requestGeoPosition();
      const response = await fetch("/api/carpenter/job-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: activeJob.id,
          action,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFieldLog(data.error || "Clock update failed.");
        return;
      }
      setFieldLog(action === "in" ? "Clocked in with GPS recorded." : "Clocked out with GPS recorded.");
      await loadMe();
      await loadPayouts();
    } catch (err) {
      setFieldLog(
        err instanceof Error
          ? err.message
          : "Could not read GPS. Allow location access and try again.",
      );
    } finally {
      setClockLoading(false);
    }
  }

  async function uploadJobSiteFiles(
    files: FileList | null,
    phase: "before" | "after",
    fallbackLabel: string,
  ) {
    if (!activeJob || !files?.length) return;
    setSiteUploadBusy(true);
    setFieldLog(null);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) continue;
        if (file.size > 14 * 1024 * 1024) {
          setFieldLog(`Skipped "${file.name}" — larger than 14 MB. Trim length or resolution and retry.`);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const response = await fetch("/api/carpenter/job-site-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: activeJob.id,
            type: isVideo ? "video" : "image",
            url: dataUrl,
            caption: `${fallbackLabel}: ${file.name}`,
            phase,
          }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          setFieldLog(data.error || "Could not upload file.");
          return;
        }
      }
      setFieldLog(`${fallbackLabel} saved for ${phase === "before" ? "before" : "after"} documentation.`);
      await loadMe();
      await loadPayouts();
    } catch {
      setFieldLog("Upload failed. Try again with smaller photos or a shorter video.");
    } finally {
      setSiteUploadBusy(false);
    }
  }

  async function handleSubmitIssue(event: FormEvent) {
    event.preventDefault();
    if (!activeJob) return;
    const input = (event.target as HTMLFormElement).elements.namedItem(
      "issuePhotos",
    ) as HTMLInputElement;
    const fileList = input?.files;
    setIssueBusy(true);
    setFieldLog(null);
    try {
      const photos: { url: string; caption: string }[] = [];
      if (fileList?.length) {
        for (const file of Array.from(fileList)) {
          if (!file.type.startsWith("image/")) continue;
          if (file.size > 10 * 1024 * 1024) continue;
          const url = await readFileAsDataUrl(file);
          photos.push({ url, caption: file.name });
        }
      }
      const response = await fetch("/api/carpenter/job-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: activeJob.id,
          notes: issueNotes,
          photos,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFieldLog(data.error || "Could not save issue.");
        return;
      }
      setIssueNotes("");
      if (input) input.value = "";
      setFieldLog("Issue report saved.");
      await loadMe();
    } finally {
      setIssueBusy(false);
    }
  }

  async function handleProfileSave(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setProfileFeedback(null);
    const extErr = validateCarpenterEmergencyAndSkills({
      emergencyContactName,
      emergencyContactRelationship,
      emergencyContactPhone,
      skillsSummary,
      toolsInventory,
    });
    if (extErr) {
      setProfileFeedback(extErr);
      return;
    }
    if (!phone.trim()) {
      setProfileFeedback("Your phone number is required.");
      return;
    }
    const response = await fetch("/api/carpenter/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        phone: phone.trim(),
        profilePictureDataUrl: avatarDataUrl,
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactRelationship: emergencyContactRelationship.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        emergencyContactAlternatePhone: emergencyContactAlternatePhone.trim(),
        skillsSummary: skillsSummary.trim(),
        toolsInventory: toolsInventory.trim(),
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setProfileFeedback(data.error || "Could not save profile.");
      return;
    }
    setProfileFeedback("Profile saved.");
    await loadMe();
  }

  async function handleAvailabilitySave(event?: FormEvent) {
    event?.preventDefault();
    if (!user) return;
    const response = await fetch("/api/carpenter/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        availabilityNotes,
        availabilityCalendar: calendarDays,
      }),
    });
    const data = (await response.json()) as { user?: CarpenterUser; error?: string };
    if (!response.ok) {
      setError(data.error || "Could not save availability.");
      return;
    }
    setCalendarMessage("Availability saved.");
    if (data.user) {
      setUser(data.user);
      setAvailabilityNotes(data.user.availabilityNotes || "");
      setCalendarDays(data.user.availabilityCalendar ?? []);
    } else {
      await loadMe();
    }
  }

  async function handleConnectGoogleCalendar() {
    const response = await fetch("/api/carpenter/google-calendar/auth-url");
    const data = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !data.url) {
      setError(data.error || "Could not start Google Calendar sync.");
      return;
    }
    window.location.href = data.url;
  }

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const nextPayText = payoutSummary?.nextExpectedPayment
    ? new Date(payoutSummary.nextExpectedPayment).toLocaleDateString()
    : "No scheduled payment.";

  const timingText = (job: Job) =>
    `Est: ${job.estimatedHours != null ? `${job.estimatedHours}h` : "—"} · Actual: ${job.actualHours != null ? `${job.actualHours}h` : "—"}`;

  if (!user) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
        <section className="rounded-3xl border border-[#dac6fb] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-8">
          <h1 className="text-3xl font-semibold text-[#2d1546]">Carpenter App</h1>
          <p className="mt-2 text-[#55337b]">
            Login or create your carpenter account to manage jobs, uploads, messages, receipts, and payouts.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setMode("login")} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "login" ? "bg-[#6e3eb2] text-white" : "border border-[#6e3eb2] text-[#5b3292]"}`}>Login</button>
            <button type="button" onClick={() => setMode("register")} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "register" ? "bg-[#6e3eb2] text-white" : "border border-[#6e3eb2] text-[#5b3292]"}`}>Create Account</button>
          </div>
          <form className="mt-4 space-y-4" onSubmit={handleAuth}>
            {mode === "login" && !forgotPasswordOpen ? (
              <input
                className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            ) : null}
            {mode === "register" ? (
              <>
                <input className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                <input className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" type="email" placeholder="Email address" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" type="tel" placeholder="Your mobile / work phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
                  <p className="text-sm font-semibold text-[#2f1748]">Emergency contact</p>
                  <p className="mt-1 text-xs text-[#6a4a8f]">
                    Someone we can call if you are injured or unreachable on a job site.
                  </p>
                  <input
                    className="mt-3 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                    placeholder="Emergency contact full name"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    required
                  />
                  <input
                    className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                    placeholder="Relationship (e.g. spouse, partner, sibling)"
                    value={emergencyContactRelationship}
                    onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                    required
                  />
                  <input
                    className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                    type="tel"
                    placeholder="Emergency contact primary phone"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    required
                  />
                  <input
                    className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                    type="tel"
                    placeholder="Alternate phone (optional)"
                    value={emergencyContactAlternatePhone}
                    onChange={(e) => setEmergencyContactAlternatePhone(e.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
                  <p className="text-sm font-semibold text-[#2f1748]">Skills & tools</p>
                  <p className="mt-1 text-xs text-[#6a4a8f]">
                    Be specific — at least {CARPENTER_PROFILE_DETAIL_MIN_CHARS} characters each. Dispatch uses this to match you to jobs.
                  </p>
                  <textarea
                    className="mt-3 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                    rows={5}
                    placeholder="What you can do: trim styles, built-ins, cabinetry, stair parts, drywall repair, finishing experience, years in trade, certifications…"
                    value={skillsSummary}
                    onChange={(e) => setSkillsSummary(e.target.value)}
                    required
                  />
                  <textarea
                    className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                    rows={4}
                    placeholder="Tools & gear you own or bring: miter saw, track saw, compressor, nailers, levels, dust extraction, scaffolding, vehicle capacity…"
                    value={toolsInventory}
                    onChange={(e) => setToolsInventory(e.target.value)}
                    required
                  />
                </div>
                <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
                  <p className="text-sm font-semibold text-[#2f1748]">Coverage & compliance</p>
                  <p className="mt-1 text-xs text-[#6a4a8f]">
                    Tell us what coverage you carry. If you check a box, details are required.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-[#4d2e70]">
                    <input
                      type="checkbox"
                      checked={hasLiabilityInsurance}
                      onChange={(e) => {
                        setHasLiabilityInsurance(e.target.checked);
                        if (!e.target.checked) setLiabilityInsuranceDetails("");
                      }}
                      className="mt-0.5"
                    />
                    I have commercial liability insurance
                  </label>
                  {hasLiabilityInsurance ? (
                    <textarea
                      className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                      rows={3}
                      placeholder="Insurer name, policy number, coverage limit, and expiry date"
                      value={liabilityInsuranceDetails}
                      onChange={(e) => setLiabilityInsuranceDetails(e.target.value)}
                      required={hasLiabilityInsurance}
                    />
                  ) : null}
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-[#4d2e70]">
                    <input
                      type="checkbox"
                      checked={hasWsib}
                      onChange={(e) => {
                        setHasWsib(e.target.checked);
                        if (!e.target.checked) setWsibDetails("");
                      }}
                      className="mt-0.5"
                    />
                    I have WSIB coverage (Ontario workplace insurance)
                  </label>
                  {hasWsib ? (
                    <textarea
                      className="mt-2 w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm"
                      rows={3}
                      placeholder="WSIB account number, clearance certificate number or status, and any notes"
                      value={wsibDetails}
                      onChange={(e) => setWsibDetails(e.target.value)}
                      required={hasWsib}
                    />
                  ) : null}
                </div>
                <input className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Profile Picture URL or Data URL (optional)" value={avatarDataUrl} onChange={(e) => setAvatarDataUrl(e.target.value)} />
              </>
            ) : null}
            {(mode === "register" || (mode === "login" && !forgotPasswordOpen)) && (
              <input
                className="w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
            {mode === "login" && !forgotPasswordOpen ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setForgotPasswordOpen(true);
                    setForgotMessage(null);
                    setForgotError(null);
                    setError(null);
                  }}
                  className="text-sm font-semibold text-[#5b3292] underline decoration-[#c9a5f1] underline-offset-4 hover:text-[#4a2381]"
                >
                  Forgot password?
                </button>
              </div>
            ) : null}
            {mode === "login" && forgotPasswordOpen ? (
              <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] px-4 py-4 space-y-3">
                <p className="text-sm text-[#4d2e70]">
                  Enter the email on your carpenter account. We&apos;ll send a reset link if we find a
                  matching account.
                </p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Your email"
                  autoComplete="email"
                  className="w-full rounded-xl border border-[#dcbef9] bg-white px-3 py-2 text-sm text-[#32174f]"
                />
                {forgotError ? <p className="text-sm text-[#a2175d]">{forgotError}</p> : null}
                {forgotMessage ? (
                  <p className="text-sm font-medium text-[#2f7a32]">{forgotMessage}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={forgotBusy}
                    onClick={() => void handleForgotPassword()}
                    className="rounded-full bg-[#6e3eb2] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {forgotBusy ? "Sending…" : "Send reset link"}
                  </button>
                  <button
                    type="button"
                    disabled={forgotBusy}
                    onClick={() => {
                      setForgotPasswordOpen(false);
                      setForgotEmail("");
                      setForgotMessage(null);
                      setForgotError(null);
                    }}
                    className="rounded-full border border-[#6e3eb2] px-5 py-2 text-sm font-semibold text-[#5b3292]"
                  >
                    Back to login
                  </button>
                </div>
              </div>
            ) : null}
            {error ? <p className="text-sm text-[#a2175d]">{error}</p> : null}
            {!(mode === "login" && forgotPasswordOpen) ? (
              <button
                type="submit"
                className="rounded-full bg-[#6e3eb2] px-5 py-2 text-sm font-semibold text-white"
              >
                {mode === "login" ? "Login" : "Create Account"}
              </button>
            ) : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10">
      <div className="rounded-3xl border border-[#dac6fb] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(91,33,182,0.55)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-[#2d1546]">Carpenter Dashboard</h1>
            <p className="text-[#55337b]">Welcome, {user.fullName?.trim() || user.email || user.username}</p>
            <p className="text-sm text-[#6a4a8f]">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="rounded-full border border-[#6e3eb2] px-4 py-2 text-sm font-semibold text-[#5b3292]">Log Out</button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {([
            ["current", "Current Jobs"],
            ["upcoming", "Upcoming Jobs"],
            ["past", "Past Jobs"],
            ["earnings", "Earnings"],
            ["schedule", "Schedule"],
            ["profile", "Profile"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSection(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                activeSection === key
                  ? "bg-[#6e3eb2] text-white"
                  : "border border-[#6e3eb2] text-[#5b3292]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeSection === "schedule" ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
              <h2 className="font-semibold text-[#2f1748]">Google Calendar</h2>
              <p className="mt-1 text-sm text-[#6a4a8f]">
                Connect your Google account to sync busy times. Use Reconnect if access expired or you
                switched calendars.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleConnectGoogleCalendar}
                  className="rounded-full border border-[#6e3eb2] bg-white px-4 py-2 text-sm font-semibold text-[#5b3292] hover:bg-[#f5efff]"
                >
                  {user.googleCalendarConnected
                    ? "Reconnect & sync Google Calendar"
                    : "Connect Google Calendar"}
                </button>
                <p className="text-sm text-[#4d2e70]">
                  {user.googleCalendarConnected
                    ? `Synced · signed in${user.googleCalendarEmail ? ` as ${user.googleCalendarEmail}` : ""}`
                    : "Not connected — tap Connect to start sync"}
                </p>
              </div>
              {calendarMessage ? (
                <p className="mt-3 text-sm text-[#2f7a32]" role="status">
                  {calendarMessage}
                </p>
              ) : null}
            </div>

            <div>
              <h2 className="mb-3 font-semibold text-[#2f1748]">Availability calendar</h2>
              <CarpenterScheduleCalendar days={calendarDays} onDaysChange={setCalendarDays} />
              <button
                type="button"
                onClick={() => void handleAvailabilitySave()}
                className="mt-4 rounded-full bg-[#6e3eb2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5e34a0]"
              >
                Save availability
              </button>
            </div>
          </div>
        ) : null}

        {activeSection === "earnings" ? (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
              <p className="text-sm text-[#6a4a8f]">Weekly Paid</p><p className="text-xl font-semibold text-[#2d1546]">{money(payoutSummary?.weekCents || 0)}</p>
            </div>
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
              <p className="text-sm text-[#6a4a8f]">Monthly Paid</p><p className="text-xl font-semibold text-[#2d1546]">{money(payoutSummary?.monthCents || 0)}</p>
            </div>
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
              <p className="text-sm text-[#6a4a8f]">Yearly Paid</p><p className="text-xl font-semibold text-[#2d1546]">{money(payoutSummary?.yearCents || 0)}</p>
            </div>
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
              <p className="text-sm text-[#6a4a8f]">Lifetime Paid</p><p className="text-xl font-semibold text-[#2d1546]">{money(payoutSummary?.lifetimeCents || 0)}</p>
            </div>
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
              <p className="text-sm text-[#6a4a8f]">Scheduled Payouts</p><p className="text-xl font-semibold text-[#2d1546]">{money(payoutSummary?.scheduledCents || 0)}</p>
            </div>
            <div className="rounded-2xl border border-[#e8d9ff] bg-[#faf6ff] p-4">
              <p className="text-sm text-[#6a4a8f]">Next Expected Payout</p><p className="text-xl font-semibold text-[#2d1546]">{nextPayText}</p>
            </div>
          </div>
        ) : null}

        {activeSection === "current" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#e8d9ff] p-4">
            <h2 className="font-semibold text-[#2f1748]">Current Jobs</h2>
            {currentJobs.length === 0 ? (
              <p className="mt-2 text-sm text-[#6a4a8f]">No active jobs right now.</p>
            ) : currentJobs.map((job) => (
              <button key={job.id} onClick={() => setActiveJobId(job.id)} className="mt-2 block w-full rounded-xl border border-[#eddfff] p-3 text-left">
                <p className="font-semibold text-[#2f1748]">{job.title}</p>
                <p className="text-sm text-[#4d2e70]">{job.status} - {new Date(job.startDate).toLocaleDateString()}</p>
                <p className="mt-1 text-xs text-[#6a4a8f]">{timingText(job)}</p>
                {(job.toolsNeeded?.length ?? 0) > 0 || (job.materialsNeeded?.length ?? 0) > 0 ? (
                  <p className="mt-1 text-xs font-medium text-[#6e3eb2]">
                    Checklist: {job.toolsNeeded?.length ?? 0} tools · {job.materialsNeeded?.length ?? 0}{" "}
                    materials
                  </p>
                ) : null}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-[#e8d9ff] p-4 lg:col-span-2">
            {activeJob ? (
              <>
                <h2 className="text-xl font-semibold text-[#2f1748]">{activeJob.title}</h2>
                <p className="mt-2 text-sm text-[#4d2e70]">
                  <span className="font-semibold">Design:</span> {activeJob.designNotes}
                </p>
                <p className="mt-1 text-sm text-[#4d2e70]">
                  <span className="font-semibold">Scope:</span> {activeJob.scopeOfWork}
                </p>
                <p className="mt-1 text-sm text-[#4d2e70]">
                  <span className="font-semibold">Client:</span> {activeJob.client.name} —{" "}
                  {activeJob.client.address}
                </p>
                <p className="mt-1 text-sm text-[#4d2e70]">
                  <span className="font-semibold">Time:</span> {timingText(activeJob)}
                </p>

                <div className="mt-4 space-y-4">
                  <MaterialsPrepCard
                    fulfillment={activeJob.materialsFulfillment}
                    notes={activeJob.materialPrepNotes}
                  />
                  <JobChecklistSection
                    tools={activeJob.toolsNeeded ?? []}
                    materials={activeJob.materialsNeeded ?? []}
                  />
                </div>

                {fieldLog ? (
                  <p className="mt-3 rounded-xl border border-[#dcc6fb] bg-[#faf6ff] px-3 py-2 text-sm text-[#31184a]">
                    {fieldLog}
                  </p>
                ) : null}

                <div className="mt-5 rounded-2xl border border-[#dcc6fb] bg-[#fdfbff] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7a4bb8]">
                    Client expectations
                  </h3>
                  <p className="mt-1 text-xs text-[#6a4a8f]">
                    Saved project briefs, AI planner notes, and photos the homeowner uploaded of the
                    space (requires their portal account linked to this job in CRM).
                  </p>
                  {!clientJobContext ? (
                    <p className="mt-2 text-sm text-[#6a4a8f]">Loading…</p>
                  ) : !clientJobContext.linked ? (
                    <p className="mt-2 text-sm text-[#55337b]">
                      {clientJobContext.message ||
                        "No client portal link yet — ask the office to connect this job to the homeowner account."}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      <p className="text-sm text-[#4d2e70]">
                        <span className="font-semibold text-[#2f1748]">Portal:</span>{" "}
                        {clientJobContext.clientName || "Client"}
                        {clientJobContext.clientEmail ? (
                          <span className="text-[#6a4a8f]"> · {clientJobContext.clientEmail}</span>
                        ) : null}
                      </p>
                      {clientJobContext.serviceAddress ? (
                        <p className="text-xs text-[#55337b]">
                          Address on file: {clientJobContext.serviceAddress}
                        </p>
                      ) : null}

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">
                          Saved briefs / drawings notes
                        </p>
                        <div className="mt-2 space-y-2">
                          {clientJobContext.ideas.length === 0 ? (
                            <p className="text-sm text-[#6a4a8f]">No saved briefs in portal.</p>
                          ) : (
                            clientJobContext.ideas.map((idea) => (
                              <div key={idea.id} className="rounded-xl border border-[#eddfff] bg-white p-3">
                                <p className="font-semibold text-[#2f1748]">{idea.title}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-[#4d2e70]">
                                  {idea.notes}
                                </p>
                                <p className="mt-2 text-[10px] text-[#a08cbd]">
                                  {new Date(idea.createdAt).toLocaleString()}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">
                          AI planner sessions (context)
                        </p>
                        <div className="mt-2 space-y-2">
                          {clientJobContext.aiPlannerActivity.length === 0 ? (
                            <p className="text-sm text-[#6a4a8f]">No planner history logged.</p>
                          ) : (
                            clientJobContext.aiPlannerActivity.slice(0, 6).map((row) => (
                              <div key={row.id} className="rounded-xl border border-[#eddfff] bg-white p-3 text-sm">
                                <p className="font-semibold text-[#31184a]">{row.intakeSummary}</p>
                                <p className="mt-1 text-xs text-[#55337b]">
                                  Goal: {row.promptPreview}
                                </p>
                                <p className="mt-1 text-xs text-[#6a4a8f]">
                                  Guidance excerpt: {row.replyPreview.slice(0, 220)}
                                  {row.replyPreview.length > 220 ? "…" : ""}
                                </p>
                                <p className="mt-2 text-[10px] text-[#a08cbd]">
                                  {new Date(row.createdAt).toLocaleString()} · {row.imageCount} intake
                                  photo(s)
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">
                          Client photos & videos of the space
                        </p>
                        {clientJobContext.spacePhotos.length === 0 ? (
                          <p className="mt-2 text-sm text-[#6a4a8f]">
                            None uploaded yet. The homeowner can add these under Client Portal →
                            Saved Ideas, in &quot;Photos & videos of your space&quot;.
                          </p>
                        ) : (
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            {clientJobContext.spacePhotos.map((ph) => (
                              <div key={ph.id} className="overflow-hidden rounded-xl border border-[#eddfff] bg-white">
                                {ph.type === "image" ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={ph.url}
                                    alt={ph.caption}
                                    className="h-40 w-full object-cover"
                                  />
                                ) : (
                                  <video controls className="h-40 w-full object-cover" src={ph.url} />
                                )}
                                <p className="border-t border-[#f0e8ff] px-2 py-1 text-xs text-[#4d2e70]">
                                  {ph.caption}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {activeJob.status === "active" ? (
                  <div className="mt-5 rounded-2xl border border-[#e8d9ff] bg-white p-4">
                    <h3 className="font-semibold text-[#2f1748]">Clock in / out (GPS)</h3>
                    <p className="mt-1 text-xs text-[#6a4a8f]">
                      Allow location access. Your coordinates are stored when you tap clock in or clock
                      out.
                    </p>
                    {(() => {
                      const openSession = activeJob.workSessions?.find((s) => !s.clockOut);
                      return (
                        <>
                          <p className="mt-2 text-sm text-[#55337b]">
                            {openSession
                              ? `On site — clocked in ${new Date(openSession.clockIn.at).toLocaleString()}`
                              : "Not clocked in for this job."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={clockLoading || Boolean(openSession)}
                              onClick={() => void handleClock("in")}
                              className="rounded-full bg-[#6e3eb2] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {clockLoading ? "GPS…" : "Clock in"}
                            </button>
                            <button
                              type="button"
                              disabled={clockLoading || !openSession}
                              onClick={() => void handleClock("out")}
                              className="rounded-full border border-[#6e3eb2] px-4 py-2 text-sm font-semibold text-[#5b3292] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Clock out
                            </button>
                          </div>
                          <div className="mt-4 space-y-4">
                            {(activeJob.workSessions ?? []).map((session) => (
                              <div
                                key={session.id}
                                className="rounded-xl border border-[#eddfff] bg-[#faf8ff] p-3"
                              >
                                <p className="text-xs font-semibold text-[#7a4bb8]">Visit</p>
                                <div className="mt-2 grid gap-3 md:grid-cols-2">
                                  <div>
                                    <p className="text-xs font-semibold text-[#31184a]">Clock in</p>
                                    <p className="text-[11px] text-[#6a4a8f]">
                                      {new Date(session.clockIn.at).toLocaleString()}
                                      {session.clockIn.accuracyM != null
                                        ? ` · ±${Math.round(session.clockIn.accuracyM)}m`
                                        : ""}
                                    </p>
                                    <iframe
                                      title="Clock-in location"
                                      className="mt-2 h-32 w-full rounded-lg border border-[#eddfff]"
                                      src={osmEmbedSrc(session.clockIn.lat, session.clockIn.lng)}
                                      loading="lazy"
                                    />
                                    <a
                                      href={`https://www.google.com/maps?q=${session.clockIn.lat},${session.clockIn.lng}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1 inline-block text-[11px] font-semibold text-[#6e3eb2] underline"
                                    >
                                      Open in Google Maps
                                    </a>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-[#31184a]">Clock out</p>
                                    {session.clockOut ? (
                                      <>
                                        <p className="text-[11px] text-[#6a4a8f]">
                                          {new Date(session.clockOut.at).toLocaleString()}
                                          {session.clockOut.accuracyM != null
                                            ? ` · ±${Math.round(session.clockOut.accuracyM)}m`
                                            : ""}
                                        </p>
                                        <iframe
                                          title="Clock-out location"
                                          className="mt-2 h-32 w-full rounded-lg border border-[#eddfff]"
                                          src={osmEmbedSrc(session.clockOut.lat, session.clockOut.lng)}
                                          loading="lazy"
                                        />
                                        <a
                                          href={`https://www.google.com/maps?q=${session.clockOut.lat},${session.clockOut.lng}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mt-1 inline-block text-[11px] font-semibold text-[#6e3eb2] underline"
                                        >
                                          Open in Google Maps
                                        </a>
                                      </>
                                    ) : (
                                      <p className="mt-2 text-sm text-[#6a4a8f]">Still open</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : null}

                <div className="mt-5 rounded-2xl border border-[#e8d9ff] bg-white p-4">
                  <h3 className="font-semibold text-[#2f1748]">Before documentation</h3>
                  <p className="mt-1 text-xs text-[#6a4a8f]">
                    Upload a walkthrough video and stills before you change the space. Multiple files
                    supported.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="inline-flex cursor-pointer flex-col gap-1 rounded-xl border border-[#dcc6fb] bg-[#faf6ff] px-3 py-2 text-sm">
                      <span className="font-semibold text-[#31184a]">Before photos</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={siteUploadBusy || activeJob.status !== "active"}
                        className="max-w-[220px] text-xs file:mr-2 file:rounded-full file:border-0 file:bg-[#ede0ff] file:px-2 file:py-1 file:text-[#4a2381]"
                        onChange={(e) =>
                          void uploadJobSiteFiles(e.target.files, "before", "Before photo")
                        }
                      />
                    </label>
                    <label className="inline-flex cursor-pointer flex-col gap-1 rounded-xl border border-[#dcc6fb] bg-[#faf6ff] px-3 py-2 text-sm">
                      <span className="font-semibold text-[#31184a]">Before video</span>
                      <input
                        type="file"
                        accept="video/*"
                        capture="environment"
                        disabled={siteUploadBusy || activeJob.status !== "active"}
                        className="max-w-[220px] text-xs file:mr-2 file:rounded-full file:border-0 file:bg-[#ede0ff] file:px-2 file:py-1 file:text-[#4a2381]"
                        onChange={(e) =>
                          void uploadJobSiteFiles(e.target.files, "before", "Before video")
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {activeJob.media
                      .filter((m) => m.phase === "before")
                      .map((item) => (
                        <div key={item.id} className="overflow-hidden rounded-lg border border-[#eddfff]">
                          {item.type === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.url}
                              alt={item.caption}
                              className="h-28 w-full object-cover"
                            />
                          ) : (
                            <video controls className="h-28 w-full object-cover" src={item.url} />
                          )}
                          <p className="px-2 py-1 text-[10px] text-[#4d2e70]">{item.caption}</p>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[#e8d9ff] bg-white p-4">
                  <h3 className="font-semibold text-[#2f1748]">After documentation</h3>
                  <p className="mt-1 text-xs text-[#6a4a8f]">
                    Photos and videos once work is complete or at milestones.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="inline-flex cursor-pointer flex-col gap-1 rounded-xl border border-[#dcc6fb] bg-[#faf6ff] px-3 py-2 text-sm">
                      <span className="font-semibold text-[#31184a]">After photos / videos</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        disabled={siteUploadBusy || activeJob.status !== "active"}
                        className="max-w-[240px] text-xs file:mr-2 file:rounded-full file:border-0 file:bg-[#ede0ff] file:px-2 file:py-1 file:text-[#4a2381]"
                        onChange={(e) =>
                          void uploadJobSiteFiles(e.target.files, "after", "After")
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {activeJob.media
                      .filter((m) => m.phase === "after")
                      .map((item) => (
                        <div key={item.id} className="overflow-hidden rounded-lg border border-[#eddfff]">
                          {item.type === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.url}
                              alt={item.caption}
                              className="h-28 w-full object-cover"
                            />
                          ) : (
                            <video controls className="h-28 w-full object-cover" src={item.url} />
                          )}
                          <p className="px-2 py-1 text-[10px] text-[#4d2e70]">{item.caption}</p>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[#f59e0b]/40 bg-[#fffbeb] p-4">
                  <h3 className="font-semibold text-[#92400e]">Complications & issues</h3>
                  <p className="mt-1 text-xs text-[#78350f]">
                    Document surprises on site with notes and photos so the office and homeowner have a
                    record.
                  </p>
                  <form className="mt-3 grid gap-2" onSubmit={handleSubmitIssue}>
                    <textarea
                      value={issueNotes}
                      onChange={(e) => setIssueNotes(e.target.value)}
                      name="issueNotes"
                      rows={3}
                      className="rounded-xl border border-[#fcd34d] bg-white px-3 py-2 text-sm"
                      placeholder="Describe the complication, structural issue, access problem, etc."
                    />
                    <input
                      id="issuePhotos"
                      name="issuePhotos"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={issueBusy || activeJob.status !== "active"}
                      className="text-xs file:mr-2 file:rounded-full file:border-0 file:bg-[#fde68a] file:px-2 file:py-1 file:text-[#78350f]"
                    />
                    <button
                      type="submit"
                      disabled={issueBusy || activeJob.status !== "active"}
                      className="w-fit rounded-full bg-[#b45309] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {issueBusy ? "Saving…" : "Save issue report"}
                    </button>
                  </form>
                  <div className="mt-4 space-y-3">
                    {(activeJob.issueReports ?? []).map((report) => (
                      <div key={report.id} className="rounded-xl border border-[#fcd34d] bg-white p-3">
                        <p className="text-sm font-semibold text-[#78350f]">
                          {new Date(report.createdAt).toLocaleString()}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[#4d2e70]">{report.notes}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {report.photos.map((ph) => (
                            <div key={ph.id}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={ph.url}
                                alt={ph.caption}
                                className="h-24 w-full rounded-lg object-cover"
                              />
                              <p className="text-[10px] text-[#6a4a8f]">{ph.caption}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <form className="mt-6 grid gap-3 rounded-2xl border border-[#e8d9ff] bg-[#faf8ff] p-4" onSubmit={handleUpdateJob}>
                  <p className="text-sm font-semibold text-[#2f1748]">General updates</p>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Internal job comment..." />
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Send message to client..." />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select value={mediaType} onChange={(e) => setMediaType(e.target.value as "image" | "video")} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm">
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm sm:col-span-2" placeholder="Media URL or data URL" />
                  </div>
                  <input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Media caption" />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input value={receiptTitle} onChange={(e) => setReceiptTitle(e.target.value)} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Receipt title" />
                    <input value={receiptAmount} onChange={(e) => setReceiptAmount(e.target.value)} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Receipt amount" />
                    <input value={receiptImage} onChange={(e) => setReceiptImage(e.target.value)} className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm" placeholder="Receipt image URL/data URL" />
                  </div>
                  <button className="w-fit rounded-full bg-[#6e3eb2] px-4 py-2 text-sm font-semibold text-white">Save update</button>
                </form>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-[#2f1748]">Messages</h3>
                    <div className="mt-2 space-y-2">
                      {activeJob.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-lg px-3 py-2 text-sm ${m.sender === "carpenter" ? "bg-[#6e3eb2] text-white" : "bg-[#f5efff] text-[#3c225d]"}`}
                        >
                          {m.text}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#2f1748]">Other media & receipts</h3>
                    <div className="mt-2 space-y-2">
                      {activeJob.media
                        .filter((item) => !item.phase || item.phase === "general")
                        .map((item) => (
                          <div key={item.id} className="rounded-lg border border-[#eddfff] p-2 text-sm text-[#4d2e70]">
                            {item.type.toUpperCase()}: {item.caption}
                          </div>
                        ))}
                      {activeJob.receipts.map((item) => (
                        <div key={item.id} className="rounded-lg border border-[#eddfff] p-2 text-sm text-[#4d2e70]">
                          Receipt: {item.title} ({money(item.amountCents)})
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-[#6a4a8f]">No jobs yet.</p>
            )}
          </div>
          </div>
        ) : null}

        {activeSection === "upcoming" ? (
          <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
            <h2 className="font-semibold text-[#2f1748]">Upcoming Jobs</h2>
            <p className="mt-1 text-sm text-[#6a4a8f]">
              Tap a job for materials logistics (pickup vs on site), scope, contact info, and your tools
              / materials checklist.
            </p>
            {availabilityNotice ? (
              <p className="mt-3 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">
                {availabilityNotice}
              </p>
            ) : null}
            {upcomingJobs.length === 0 ? (
              <p className="mt-2 text-sm text-[#6a4a8f]">No upcoming jobs.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {upcomingJobs.map((job) => {
                  const expanded = expandedUpcomingJobId === job.id;
                  return (
                    <div
                      key={job.id}
                      className={`overflow-hidden rounded-xl border ${expanded ? "border-[#c9a5f1]" : "border-[#eddfff]"}`}
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedUpcomingJobId((id) => (id === job.id ? null : job.id))
                        }
                        className="w-full p-3 text-left transition hover:bg-[#faf8ff]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#2f1748]">{job.title}</p>
                            <p className="text-sm text-[#4d2e70]">
                              {new Date(job.startDate).toLocaleDateString()} · {job.status}
                            </p>
                            <p className="mt-1 text-xs text-[#6a4a8f]">{timingText(job)}</p>
                            <p className="mt-1 text-xs font-medium text-[#6e3eb2]">
                              {materialsFulfillmentHint(job.materialsFulfillment)}
                            </p>
                            {job.availabilityReview === "pending" ? (
                              <p className="mt-1 text-xs font-semibold text-[#b45309]">
                                Pending your availability confirmation
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-xs font-medium text-[#7a4bb8]">
                            {expanded ? "Hide" : "Prep"}
                          </span>
                        </div>
                      </button>
                      {expanded ? (
                        <div className="space-y-4 border-t border-[#eddfff] bg-[#fdfbff] px-3 pb-4 pt-4">
                          <MaterialsPrepCard
                            fulfillment={job.materialsFulfillment}
                            notes={job.materialPrepNotes}
                          />
                          {job.availabilityReview === "pending" ? (
                            <div className="rounded-2xl border border-[#fbbf24]/70 bg-[#fffbeb] p-4">
                              <p className="text-sm font-semibold text-[#78350f]">
                                Pending for review — confirm your availability
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-[#92400e]">
                                The office matched this booking to you. Please confirm you can cover the
                                date window once the homeowner has been finalized — tap below when you&apos;ve
                                reviewed the scope and schedule with dispatch.
                              </p>
                              <button
                                type="button"
                                disabled={availabilityBusyJobId === job.id}
                                onClick={() => void confirmJobAvailability(job.id)}
                                className="mt-3 rounded-full bg-[#ea580c] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#c2410c] disabled:opacity-60"
                              >
                                {availabilityBusyJobId === job.id ? "Saving…" : "Confirm I'm available"}
                              </button>
                            </div>
                          ) : job.availabilityReview === "cleared" ? (
                            <p className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">
                              You&apos;ve acknowledged availability for this booking.
                            </p>
                          ) : null}
                          <div className="rounded-xl border border-[#e8d9ff] bg-white p-3">
                            <p className="text-sm text-[#4d2e70]">
                              <span className="font-semibold text-[#2f1748]">Design:</span>{" "}
                              {job.designNotes}
                            </p>
                            <p className="mt-2 text-sm text-[#4d2e70]">
                              <span className="font-semibold text-[#2f1748]">Scope:</span>{" "}
                              {job.scopeOfWork}
                            </p>
                            <p className="mt-2 text-sm text-[#4d2e70]">
                              <span className="font-semibold text-[#2f1748]">Client:</span>{" "}
                              {job.client.name}
                            </p>
                            <p className="mt-1 text-sm text-[#4d2e70]">{job.client.address}</p>
                            <p className="mt-2 text-sm text-[#4d2e70]">
                              <span className="font-semibold text-[#2f1748]">Phone:</span>{" "}
                              {job.client.phone || "—"}
                            </p>
                            <p className="mt-1 text-sm text-[#4d2e70]">
                              <span className="font-semibold text-[#2f1748]">Email:</span>{" "}
                              {job.client.email}
                            </p>
                            {job.estimatedHours != null ? (
                              <p className="mt-2 text-sm text-[#4d2e70]">
                                <span className="font-semibold text-[#2f1748]">Est. hours:</span>{" "}
                                {job.estimatedHours}
                              </p>
                            ) : null}
                          </div>
                          <JobChecklistSection
                            tools={job.toolsNeeded ?? []}
                            materials={job.materialsNeeded ?? []}
                          />
                          {(job.comments ?? []).length > 0 ? (
                            <div className="rounded-xl border border-[#e8d9ff] bg-white p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">
                                Notes from the office
                              </p>
                              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[#4d2e70]">
                                {job.comments.map((line, idx) => (
                                  <li key={`${idx}-${line.slice(0, 24)}`}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {activeSection === "past" ? (
          <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
            <h2 className="font-semibold text-[#2f1748]">Past Jobs</h2>
            {completedJobs.length === 0 ? (
              <p className="mt-2 text-sm text-[#6a4a8f]">No completed jobs yet.</p>
            ) : (
              <div className="mt-2 grid gap-2">
                {completedJobs.map((job) => (
                  <div key={job.id} className="rounded-xl border border-[#eddfff] p-3">
                    <p className="font-semibold text-[#2f1748]">{job.title}</p>
                    <p className="text-sm text-[#4d2e70]">
                      Completed · {new Date(job.startDate).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-xs text-[#6a4a8f]">{timingText(job)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeSection === "profile" ? (
        <div className="mt-6 rounded-2xl border border-[#e8d9ff] p-4">
          <h2 className="font-semibold text-[#2f1748]">Profile</h2>
          <p className="mt-1 text-sm text-[#55337b]">
            Keep emergency contact and skills current so we can reach someone on site and assign the right projects.
          </p>
          <div className="mt-3 rounded-xl border border-[#eddfff] bg-[#faf6ff] p-3 text-sm text-[#4d2e70]">
            <p>
              <span className="font-semibold text-[#2f1748]">Phone:</span> {user.phone || "—"}
            </p>
            <p className="mt-3 font-semibold text-[#2f1748]">Emergency contact</p>
            <p className="mt-1">
              {user.emergencyContactName || "—"}
              {user.emergencyContactRelationship ? (
                <span className="text-[#6a4a8f]"> ({user.emergencyContactRelationship})</span>
              ) : null}
            </p>
            <p className="mt-1">{user.emergencyContactPhone || "—"}</p>
            {user.emergencyContactAlternatePhone ? (
              <p className="mt-1 text-xs text-[#6a4a8f]">
                Alt: {user.emergencyContactAlternatePhone}
              </p>
            ) : null}
            <p className="mt-3 font-semibold text-[#2f1748]">Skills</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
              {user.skillsSummary?.trim() || "—"}
            </p>
            <p className="mt-3 font-semibold text-[#2f1748]">Tools & gear</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
              {user.toolsInventory?.trim() || "—"}
            </p>
            <p className="mt-3 font-semibold text-[#2f1748]">Coverage</p>
            <p className="mt-1">
              <span className="font-semibold text-[#31184a]">Liability:</span>{" "}
              {user.hasLiabilityInsurance ? "Yes" : "Not provided at signup"}
            </p>
            {user.hasLiabilityInsurance && user.liabilityInsuranceDetails ? (
              <p className="mt-1 whitespace-pre-wrap text-xs">{user.liabilityInsuranceDetails}</p>
            ) : null}
            <p className="mt-2">
              <span className="font-semibold text-[#31184a]">WSIB:</span>{" "}
              {user.hasWsib ? "Yes" : "Not provided at signup"}
            </p>
            {user.hasWsib && user.wsibDetails ? (
              <p className="mt-1 whitespace-pre-wrap text-xs">{user.wsibDetails}</p>
            ) : null}
          </div>
          <form className="mt-4 grid gap-3" onSubmit={handleProfileSave}>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                placeholder="Full name"
                required
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                type="tel"
                placeholder="Your mobile / work phone"
                required
              />
            </div>
            <div className="rounded-xl border border-[#e8d9ff] bg-[#fdfbff] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7a4bb8]">Emergency contact</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                  placeholder="Contact name"
                  required
                />
                <input
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                  className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                  placeholder="Relationship"
                  required
                />
                <input
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                  type="tel"
                  placeholder="Primary phone"
                  required
                />
                <input
                  value={emergencyContactAlternatePhone}
                  onChange={(e) => setEmergencyContactAlternatePhone(e.target.value)}
                  className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                  type="tel"
                  placeholder="Alternate phone (optional)"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#55337b]">Skills (min {CARPENTER_PROFILE_DETAIL_MIN_CHARS} chars)</label>
              <textarea
                value={skillsSummary}
                onChange={(e) => setSkillsSummary(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                placeholder="Trades, specialties, experience…"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#55337b]">Tools & gear (min {CARPENTER_PROFILE_DETAIL_MIN_CHARS} chars)</label>
              <textarea
                value={toolsInventory}
                onChange={(e) => setToolsInventory(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
                placeholder="Equipment you bring or own…"
                required
              />
            </div>
            <input
              value={avatarDataUrl}
              onChange={(e) => setAvatarDataUrl(e.target.value)}
              className="rounded-xl border border-[#dcbef9] px-3 py-2 text-sm"
              placeholder="Profile picture URL / data URL (optional)"
            />
            {profileFeedback ? (
              <p
                className={`text-sm ${
                  profileFeedback.startsWith("Profile saved") ? "text-[#2f7a32]" : "text-[#a2175d]"
                }`}
              >
                {profileFeedback}
              </p>
            ) : null}
            <button
              type="submit"
              className="w-fit rounded-full bg-[#6e3eb2] px-4 py-2 text-sm font-semibold text-white"
            >
              Save profile
            </button>
          </form>
        </div>
        ) : null}
      </div>
    </main>
  );
}

