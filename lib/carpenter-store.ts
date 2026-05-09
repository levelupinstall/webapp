import { randomUUID } from "crypto";
import type { CarpenterAccount as CarpenterAccountRow } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CarpenterCalendarDay } from "./carpenter-calendar-types";

export type ClientProfile = {
  name: string;
  email: string;
  phone: string;
  address: string;
  avatarDataUrl: string;
};

type JobMessage = {
  id: string;
  sender: "carpenter" | "client";
  text: string;
  createdAt: string;
};

export type JobMediaPhase = "general" | "before" | "after";

export type JobMedia = {
  id: string;
  type: "image" | "video";
  url: string;
  caption: string;
  createdAt: string;
  phase: JobMediaPhase;
};

export type GeoPing = {
  at: string;
  lat: number;
  lng: number;
  accuracyM?: number;
};

export type WorkSession = {
  id: string;
  clockIn: GeoPing;
  clockOut?: GeoPing;
};

export type JobIssueReport = {
  id: string;
  notes: string;
  photos: { id: string; url: string; caption: string; createdAt: string }[];
  createdAt: string;
};

type Receipt = {
  id: string;
  title: string;
  amountCents: number;
  imageDataUrl: string;
  createdAt: string;
};

type Payment = {
  id: string;
  amountCents: number;
  paidAt: string;
  expectedAt?: string;
  status: "paid" | "scheduled";
};

export type CarpenterJob = {
  id: string;
  title: string;
  status: "upcoming" | "completed" | "active";
  startDate: string;
  designNotes: string;
  scopeOfWork: string;
  client: ClientProfile;
  comments: string[];
  media: JobMedia[];
  receipts: Receipt[];
  messages: JobMessage[];
  payments: Payment[];
  clientPortalUserId?: string;
  estimatedHours?: number;
  actualHours?: number;
  materialCostCents?: number;
  workSessions?: WorkSession[];
  issueReports?: JobIssueReport[];
  toolsNeeded: string[];
  materialsNeeded: string[];
  materialsFulfillment?: MaterialsFulfillment;
  materialPrepNotes: string;
  availabilityReview?: AvailabilityReview;
};

type CarpenterUser = {
  id: string;
  username: string;
  passwordHash: string;
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
  availabilityCalendar: CarpenterCalendarDay[];
  googleCalendarConnected: boolean;
  googleCalendarEmail: string;
  googleCalendarRefreshToken: string;
  profilePictureDataUrl: string;
  jobs: CarpenterJob[];
};

/** Who supplies / stages materials before work begins */
export type MaterialsFulfillment = "pickup" | "on_site" | "mixed";

/** Carpenter must acknowledge assigned upcoming slot before treated as firm */
export type AvailabilityReview = "pending" | "cleared";

export type { CarpenterCalendarDay } from "./carpenter-calendar-types";

export function parseAvailabilityCalendar(raw: unknown): CarpenterCalendarDay[] {
  if (!Array.isArray(raw)) return [];
  const out: CarpenterCalendarDay[] = [];
  const seen = new Set<string>();
  const timeOk = (t: string) => /^\d{2}:\d{2}$/.test(t);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const date = typeof rec.date === "string" ? rec.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
    const status = rec.status === "unavailable" ? "unavailable" : "available";
    let startTime = typeof rec.startTime === "string" ? rec.startTime.trim() : "08:00";
    let endTime = typeof rec.endTime === "string" ? rec.endTime.trim() : "17:00";
    if (!timeOk(startTime)) startTime = "08:00";
    if (!timeOk(endTime)) endTime = "17:00";
    seen.add(date);
    out.push({ date, status, startTime, endTime });
    if (out.length >= 400) break;
  }
  return out;
}

export function parseMaterialsFulfillment(input: unknown): MaterialsFulfillment | undefined {
  const s = typeof input === "string" ? input.trim() : "";
  if (s === "pickup" || s === "on_site" || s === "mixed") return s;
  return undefined;
}

export function parseAvailabilityReview(input: unknown): AvailabilityReview | undefined {
  const s = typeof input === "string" ? input.trim() : "";
  if (s === "pending" || s === "cleared") return s;
  return undefined;
}

/** Normalize tools/materials lines from CRM (array or newline-separated string). */
export function normalizeJobItemList(input: unknown): string[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return [...new Set(input.map((x) => String(x).trim()).filter(Boolean))];
  }
  if (typeof input === "string") {
    return [...new Set(input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  }
  return [];
}

function hydrateJob(job: CarpenterJob): CarpenterJob {
  const media = (job.media ?? []).map((m) => ({
    ...m,
    phase: (m as JobMedia).phase ?? "general",
  }));
  return {
    ...job,
    clientPortalUserId: job.clientPortalUserId,
    estimatedHours: job.estimatedHours,
    actualHours: job.actualHours,
    materialCostCents: job.materialCostCents,
    workSessions: job.workSessions ?? [],
    issueReports: job.issueReports ?? [],
    toolsNeeded: job.toolsNeeded ?? [],
    materialsNeeded: job.materialsNeeded ?? [],
    materialsFulfillment: parseMaterialsFulfillment(job.materialsFulfillment),
    materialPrepNotes: (job.materialPrepNotes ?? "").trim(),
    availabilityReview: parseAvailabilityReview(job.availabilityReview),
    media,
  };
}

function hydrateCarpenter(raw: CarpenterUser): CarpenterUser {
  return {
    ...raw,
    jobs: (raw.jobs ?? []).map(hydrateJob),
    profilePictureDataUrl: raw.profilePictureDataUrl ?? "",
    email: raw.email ?? "",
    phone: raw.phone ?? "",
    emergencyContactName: raw.emergencyContactName ?? "",
    emergencyContactRelationship: raw.emergencyContactRelationship ?? "",
    emergencyContactPhone: raw.emergencyContactPhone ?? "",
    emergencyContactAlternatePhone: raw.emergencyContactAlternatePhone ?? "",
    skillsSummary: raw.skillsSummary ?? "",
    toolsInventory: raw.toolsInventory ?? "",
    hasLiabilityInsurance: Boolean(raw.hasLiabilityInsurance),
    liabilityInsuranceDetails: raw.liabilityInsuranceDetails ?? "",
    hasWsib: Boolean(raw.hasWsib),
    wsibDetails: raw.wsibDetails ?? "",
    availabilityNotes: raw.availabilityNotes ?? "",
    availabilityCalendar: parseAvailabilityCalendar(raw.availabilityCalendar),
    googleCalendarConnected: Boolean(raw.googleCalendarConnected),
    googleCalendarEmail: raw.googleCalendarEmail ?? "",
    googleCalendarRefreshToken: raw.googleCalendarRefreshToken ?? "",
  };
}

function rowToCarpenterUser(row: CarpenterAccountRow): CarpenterUser {
  const jobsRaw = row.jobs;
  const jobsArray = Array.isArray(jobsRaw) ? (jobsRaw as unknown as CarpenterJob[]) : [];
  return hydrateCarpenter({
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    emergencyContactName: row.emergencyContactName,
    emergencyContactRelationship: row.emergencyContactRelationship,
    emergencyContactPhone: row.emergencyContactPhone,
    emergencyContactAlternatePhone: row.emergencyContactAlternatePhone,
    skillsSummary: row.skillsSummary,
    toolsInventory: row.toolsInventory,
    hasLiabilityInsurance: row.hasLiabilityInsurance,
    liabilityInsuranceDetails: row.liabilityInsuranceDetails,
    hasWsib: row.hasWsib,
    wsibDetails: row.wsibDetails,
    availabilityNotes: row.availabilityNotes,
    availabilityCalendar: row.availabilityCalendar as unknown as CarpenterCalendarDay[],
    googleCalendarConnected: row.googleCalendarConnected,
    googleCalendarEmail: row.googleCalendarEmail,
    googleCalendarRefreshToken: row.googleCalendarRefreshToken,
    profilePictureDataUrl: row.profilePictureDataUrl,
    jobs: jobsArray,
  });
}

async function persistCarpenterAccount(user: CarpenterUser) {
  await prisma.carpenterAccount.update({
    where: { id: user.id },
    data: {
      username: user.username,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      emergencyContactName: user.emergencyContactName,
      emergencyContactRelationship: user.emergencyContactRelationship,
      emergencyContactPhone: user.emergencyContactPhone,
      emergencyContactAlternatePhone: user.emergencyContactAlternatePhone,
      skillsSummary: user.skillsSummary,
      toolsInventory: user.toolsInventory,
      hasLiabilityInsurance: user.hasLiabilityInsurance,
      liabilityInsuranceDetails: user.liabilityInsuranceDetails,
      hasWsib: user.hasWsib,
      wsibDetails: user.wsibDetails,
      availabilityNotes: user.availabilityNotes,
      availabilityCalendar: user.availabilityCalendar as unknown as Prisma.InputJsonValue,
      googleCalendarConnected: user.googleCalendarConnected,
      googleCalendarEmail: user.googleCalendarEmail,
      googleCalendarRefreshToken: user.googleCalendarRefreshToken,
      profilePictureDataUrl: user.profilePictureDataUrl,
      jobs: user.jobs as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Removes CRM link between carpenter jobs and a deleted portal user (jobs retain client name/contact). */
export async function unlinkPortalUserFromAllCarpenterJobs(
  portalUserId: string,
): Promise<number> {
  const rows = await prisma.carpenterAccount.findMany();
  let accountsUpdated = 0;

  for (const row of rows) {
    const user = rowToCarpenterUser(row);
    let dirty = false;
    for (const job of user.jobs) {
      if (job.clientPortalUserId === portalUserId) {
        delete job.clientPortalUserId;
        dirty = true;
      }
    }
    if (dirty) {
      await persistCarpenterAccount(user);
      accountsUpdated += 1;
    }
  }

  return accountsUpdated;
}

export async function findCarpenterByUsername(username: string) {
  const row = await prisma.carpenterAccount.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  return row ? rowToCarpenterUser(row) : undefined;
}

export async function createCarpenterUser(params: {
  username: string;
  passwordHash: string;
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
  availabilityNotes?: string;
  profilePictureDataUrl: string;
}) {
  const exists = await prisma.carpenterAccount.findFirst({
    where: { username: { equals: params.username, mode: "insensitive" } },
  });
  if (exists) throw new Error("Username already exists.");

  const now = new Date().toISOString();
  const sampleJob: CarpenterJob = {
    id: randomUUID(),
    title: "Mudroom Built-In Storage",
    status: "upcoming",
    startDate: now,
    designNotes: "Modern shaker profile, satin white, walnut bench top.",
    scopeOfWork:
      "Install bench, overhead cubbies, side panel trim, and finishing details.",
    client: {
      name: "Jamie Parker",
      email: "jamie@example.com",
      phone: "647-555-0122",
      address: "123 Maple Avenue, Toronto, ON",
      avatarDataUrl: "",
    },
    comments: ["Client requested extra shoe storage under bench."],
    media: [],
    receipts: [],
    messages: [
      {
        id: randomUUID(),
        sender: "client",
        text: "Can we confirm the install start time for next Tuesday?",
        createdAt: now,
      },
    ],
    payments: [
      {
        id: randomUUID(),
        amountCents: 15000,
        paidAt: now,
        status: "paid",
      },
      {
        id: randomUUID(),
        amountCents: 120000,
        paidAt: "",
        status: "scheduled",
        expectedAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      },
    ],
    toolsNeeded: [
      "Track or miter saw",
      "Finish nailer + compressor",
      "Level + laser or long straightedge",
      "Oscillating multi-tool",
      "Cabinet clamps",
    ],
    materialsNeeded: [
      "Paint-grade MDF or birch plywood per cut list",
      "Matching shaker-style door stock / face frames",
      "Shelf pins & brackets",
      "Wood glue, wood filler",
      "Primed trim stock for scribes",
    ],
    materialsFulfillment: "mixed",
    materialPrepNotes:
      "Pick up sheet goods and shaker door blank at supplier — account Level Up. Face-frame lumber is already in the client garage (south wall).",
  };

  const jobsPayload = [hydrateJob(sampleJob)];

  try {
    const row = await prisma.carpenterAccount.create({
      data: {
        username: params.username,
        passwordHash: params.passwordHash,
        fullName: params.fullName,
        email: params.email,
        phone: params.phone,
        emergencyContactName: params.emergencyContactName,
        emergencyContactRelationship: params.emergencyContactRelationship,
        emergencyContactPhone: params.emergencyContactPhone,
        emergencyContactAlternatePhone: params.emergencyContactAlternatePhone,
        skillsSummary: params.skillsSummary,
        toolsInventory: params.toolsInventory,
        hasLiabilityInsurance: params.hasLiabilityInsurance,
        liabilityInsuranceDetails: params.liabilityInsuranceDetails,
        hasWsib: params.hasWsib,
        wsibDetails: params.wsibDetails,
        availabilityNotes: params.availabilityNotes ?? "",
        availabilityCalendar: [],
        googleCalendarConnected: false,
        googleCalendarEmail: "",
        googleCalendarRefreshToken: "",
        profilePictureDataUrl: params.profilePictureDataUrl,
        jobs: jobsPayload as unknown as Prisma.InputJsonValue,
      },
    });
    return rowToCarpenterUser(row);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("Username already exists.");
    }
    throw error;
  }
}

export async function getCarpenterDashboard(carpenterId: string) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    emergencyContactName: user.emergencyContactName,
    emergencyContactRelationship: user.emergencyContactRelationship,
    emergencyContactPhone: user.emergencyContactPhone,
    emergencyContactAlternatePhone: user.emergencyContactAlternatePhone,
    skillsSummary: user.skillsSummary,
    toolsInventory: user.toolsInventory,
    hasLiabilityInsurance: user.hasLiabilityInsurance,
    liabilityInsuranceDetails: user.liabilityInsuranceDetails,
    hasWsib: user.hasWsib,
    wsibDetails: user.wsibDetails,
    availabilityNotes: user.availabilityNotes,
    availabilityCalendar: user.availabilityCalendar ?? [],
    googleCalendarConnected: user.googleCalendarConnected,
    googleCalendarEmail: user.googleCalendarEmail,
    profilePictureDataUrl: user.profilePictureDataUrl,
    jobs: user.jobs,
  };
}

export async function updateCarpenterProfile(
  carpenterId: string,
  profile: {
    fullName: string;
    phone: string;
    profilePictureDataUrl: string;
    emergencyContactName: string;
    emergencyContactRelationship: string;
    emergencyContactPhone: string;
    emergencyContactAlternatePhone: string;
    skillsSummary: string;
    toolsInventory: string;
  },
) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  user.fullName = profile.fullName;
  user.phone = profile.phone;
  user.profilePictureDataUrl = profile.profilePictureDataUrl;
  user.emergencyContactName = profile.emergencyContactName;
  user.emergencyContactRelationship = profile.emergencyContactRelationship;
  user.emergencyContactPhone = profile.emergencyContactPhone;
  user.emergencyContactAlternatePhone = profile.emergencyContactAlternatePhone;
  user.skillsSummary = profile.skillsSummary;
  user.toolsInventory = profile.toolsInventory;
  await persistCarpenterAccount(user);
  return getCarpenterDashboard(carpenterId);
}

export async function updateCarpenterAvailability(
  carpenterId: string,
  availabilityNotes: string,
  availabilityCalendar?: unknown,
) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  user.availabilityNotes = availabilityNotes;
  if (availabilityCalendar !== undefined) {
    user.availabilityCalendar = parseAvailabilityCalendar(availabilityCalendar);
  }
  await persistCarpenterAccount(user);
  return getCarpenterDashboard(carpenterId);
}

export async function connectCarpenterGoogleCalendar(params: {
  carpenterId: string;
  email: string;
  refreshToken: string;
}) {
  const row = await prisma.carpenterAccount.findUnique({
    where: { id: params.carpenterId },
  });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  user.googleCalendarConnected = true;
  user.googleCalendarEmail = params.email;
  user.googleCalendarRefreshToken = params.refreshToken;
  await persistCarpenterAccount(user);
  return getCarpenterDashboard(params.carpenterId);
}

export async function addJobUpdate(
  carpenterId: string,
  params: {
    jobId: string;
    comment?: string;
    message?: string;
    confirmAvailability?: boolean;
    media?: { type: "image" | "video"; url: string; caption: string; phase?: JobMediaPhase };
    receipt?: { title: string; amountCents: number; imageDataUrl: string };
  },
) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  const job = user.jobs.find((item) => item.id === params.jobId);
  if (!job) throw new Error("Job not found.");

  if (params.comment?.trim()) job.comments.unshift(params.comment.trim());
  if (params.message?.trim()) {
    job.messages.push({
      id: randomUUID(),
      sender: "carpenter",
      text: params.message.trim(),
      createdAt: new Date().toISOString(),
    });
  }
  if (params.media?.url) {
    job.media.unshift({
      id: randomUUID(),
      type: params.media.type,
      url: params.media.url,
      caption: params.media.caption || "Update",
      createdAt: new Date().toISOString(),
      phase: params.media.phase ?? "general",
    });
  }
  if (params.confirmAvailability && job.availabilityReview === "pending") {
    job.availabilityReview = "cleared";
    job.comments.unshift("Carpenter confirmed availability for this booking.");
  }
  if (params.receipt?.title && params.receipt.amountCents > 0) {
    job.receipts.unshift({
      id: randomUUID(),
      title: params.receipt.title,
      amountCents: params.receipt.amountCents,
      imageDataUrl: params.receipt.imageDataUrl || "",
      createdAt: new Date().toISOString(),
    });
  }

  await persistCarpenterAccount(user);
  return job;
}

export async function clockJobIn(
  carpenterId: string,
  jobId: string,
  geo: { lat: number; lng: number; accuracyM?: number },
) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  const job = user.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Job not found.");
  if (job.status !== "active") throw new Error("Clock in is only available on active jobs.");

  const sessions = [...(job.workSessions ?? [])];
  const open = sessions.find((s) => !s.clockOut);
  if (open) throw new Error("You are already clocked in. Clock out before starting a new session.");

  sessions.push({
    id: randomUUID(),
    clockIn: { at: new Date().toISOString(), lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM },
  });
  job.workSessions = sessions;
  await persistCarpenterAccount(user);
  return job;
}

export async function clockJobOut(
  carpenterId: string,
  jobId: string,
  geo: { lat: number; lng: number; accuracyM?: number },
) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  const job = user.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Job not found.");
  if (job.status !== "active") throw new Error("Clock out is only available on active jobs.");

  const sessions = [...(job.workSessions ?? [])];
  const openIdx = sessions.findIndex((s) => !s.clockOut);
  if (openIdx === -1) throw new Error("Clock in before clocking out.");

  sessions[openIdx] = {
    ...sessions[openIdx],
    clockOut: { at: new Date().toISOString(), lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM },
  };
  job.workSessions = sessions;
  await persistCarpenterAccount(user);
  return job;
}

export async function addJobSiteMedia(
  carpenterId: string,
  jobId: string,
  params: {
    type: "image" | "video";
    url: string;
    caption: string;
    phase: JobMediaPhase;
  },
) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  const job = user.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Job not found.");
  if (!params.url.trim()) throw new Error("Media URL is required.");

  const phase = params.phase === "before" || params.phase === "after" ? params.phase : "general";
  job.media.unshift({
    id: randomUUID(),
    type: params.type,
    url: params.url.trim(),
    caption: params.caption.trim() || (phase === "before" ? "Before" : phase === "after" ? "After" : "Update"),
    createdAt: new Date().toISOString(),
    phase,
  });

  await persistCarpenterAccount(user);
  return job;
}

export async function addJobIssueReport(
  carpenterId: string,
  jobId: string,
  params: { notes: string; photos: { url: string; caption?: string }[] },
) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  const job = user.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Job not found.");

  const notes = params.notes.trim();
  if (!notes && (!params.photos || params.photos.length === 0)) {
    throw new Error("Add notes or at least one photo for an issue report.");
  }

  const now = new Date().toISOString();
  const photos = (params.photos ?? [])
    .filter((p) => p.url.trim())
    .map((p) => ({
      id: randomUUID(),
      url: p.url.trim(),
      caption: (p.caption ?? "").trim() || "Issue photo",
      createdAt: now,
    }));

  const reports = [...(job.issueReports ?? [])];
  reports.unshift({
    id: randomUUID(),
    notes: notes || "(photos only)",
    photos,
    createdAt: now,
  });
  job.issueReports = reports;

  await persistCarpenterAccount(user);
  return job;
}

export async function getCarpenterJob(carpenterId: string, jobId: string) {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) throw new Error("Carpenter not found.");
  const user = rowToCarpenterUser(row);
  const job = user.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Job not found.");
  return job;
}

export async function listCarpentersForAdmin() {
  const rows = await prisma.carpenterAccount.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((row) => {
    const c = rowToCarpenterUser(row);
    return {
      id: c.id,
      username: c.username,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      emergencyContactName: c.emergencyContactName || "",
      emergencyContactRelationship: c.emergencyContactRelationship || "",
      emergencyContactPhone: c.emergencyContactPhone || "",
      emergencyContactAlternatePhone: c.emergencyContactAlternatePhone || "",
      skillsSummary: c.skillsSummary || "",
      toolsInventory: c.toolsInventory || "",
      availabilityNotes: c.availabilityNotes || "",
      googleCalendarConnected: Boolean(c.googleCalendarConnected),
      googleCalendarEmail: c.googleCalendarEmail || "",
      activeJobCount: c.jobs.filter((j) => j.status === "active").length,
      upcomingJobCount: c.jobs.filter((j) => j.status === "upcoming").length,
      jobs: c.jobs,
    };
  });
}

export async function adminAssignJob(params: {
  carpenterId: string;
  title: string;
  designNotes: string;
  scopeOfWork: string;
  client: ClientProfile;
  clientPortalUserId?: string;
  status?: "upcoming" | "active" | "completed";
  estimatedHours?: number;
  materialCostCents?: number;
  toolsNeeded?: unknown;
  materialsNeeded?: unknown;
  materialsFulfillment?: unknown;
  materialPrepNotes?: string;
  availabilityReview?: unknown;
}) {
  const row = await prisma.carpenterAccount.findUnique({
    where: { id: params.carpenterId },
  });
  if (!row) throw new Error("Carpenter not found.");
  const carpenter = rowToCarpenterUser(row);

  const fulfillment = parseMaterialsFulfillment(params.materialsFulfillment);
  const status = params.status || "active";
  const availabilityParsed = parseAvailabilityReview(params.availabilityReview);
  const now = new Date().toISOString();
  const job: CarpenterJob = {
    id: randomUUID(),
    title: params.title,
    status,
    startDate: now,
    designNotes: params.designNotes,
    scopeOfWork: params.scopeOfWork,
    client: params.client,
    comments: ["Job assigned from CRM."],
    media: [],
    receipts: [],
    messages: [],
    payments: [],
    clientPortalUserId: params.clientPortalUserId || undefined,
    estimatedHours: params.estimatedHours,
    materialCostCents: params.materialCostCents,
    toolsNeeded: normalizeJobItemList(params.toolsNeeded),
    materialsNeeded: normalizeJobItemList(params.materialsNeeded),
    materialPrepNotes: String(params.materialPrepNotes ?? "").trim(),
    ...(fulfillment ? { materialsFulfillment: fulfillment } : {}),
    ...(status === "upcoming"
      ? {
          availabilityReview: availabilityParsed ?? "pending",
        }
      : {}),
  };
  carpenter.jobs.unshift(hydrateJob(job));
  await persistCarpenterAccount(carpenter);
  return job;
}

/** Completed-job summary for CRM social sharing (admin-only callers). */
export async function getCompletedJobSummaryForSocial(
  carpenterId: string,
  jobId: string,
): Promise<{
  title: string;
  startDate: string;
  clientName: string;
  carpenterUsername: string;
  carpenterFullName: string;
} | null> {
  const row = await prisma.carpenterAccount.findUnique({ where: { id: carpenterId } });
  if (!row) return null;
  const carpenter = rowToCarpenterUser(row);
  const job = carpenter.jobs.find((item) => item.id === jobId);
  if (!job || job.status !== "completed") return null;
  return {
    title: job.title,
    startDate: job.startDate,
    clientName: job.client.name,
    carpenterUsername: carpenter.username,
    carpenterFullName: carpenter.fullName,
  };
}

export async function adminUpdateJob(params: {
  carpenterId: string;
  jobId: string;
  status?: "upcoming" | "active" | "completed";
  estimatedHours?: number;
  actualHours?: number;
  materialCostCents?: number;
  toolsNeeded?: unknown;
  materialsNeeded?: unknown;
  materialsFulfillment?: unknown;
  materialPrepNotes?: string;
  availabilityReview?: unknown;
}) {
  const row = await prisma.carpenterAccount.findUnique({
    where: { id: params.carpenterId },
  });
  if (!row) throw new Error("Carpenter not found.");
  const carpenter = rowToCarpenterUser(row);
  const job = carpenter.jobs.find((item) => item.id === params.jobId);
  if (!job) throw new Error("Job not found.");

  if (params.status !== undefined) job.status = params.status;
  if (params.status !== undefined && params.status !== "upcoming") {
    delete job.availabilityReview;
  }
  if (params.estimatedHours !== undefined) job.estimatedHours = params.estimatedHours;
  if (params.actualHours !== undefined) job.actualHours = params.actualHours;
  if (params.materialCostCents !== undefined) job.materialCostCents = params.materialCostCents;
  if (params.toolsNeeded !== undefined) job.toolsNeeded = normalizeJobItemList(params.toolsNeeded);
  if (params.materialsNeeded !== undefined) {
    job.materialsNeeded = normalizeJobItemList(params.materialsNeeded);
  }
  if (params.materialPrepNotes !== undefined) {
    job.materialPrepNotes = String(params.materialPrepNotes).trim();
  }
  if (params.materialsFulfillment !== undefined) {
    const v = parseMaterialsFulfillment(params.materialsFulfillment);
    if (v === undefined) {
      delete job.materialsFulfillment;
    } else {
      job.materialsFulfillment = v;
    }
  }
  if (params.availabilityReview !== undefined) {
    const v = parseAvailabilityReview(params.availabilityReview);
    if (v === undefined) {
      delete job.availabilityReview;
    } else if (job.status === "upcoming") {
      job.availabilityReview = v;
    }
  }
  if (
    job.status === "upcoming" &&
    params.status === "upcoming" &&
    params.availabilityReview === undefined &&
    job.availabilityReview === undefined
  ) {
    job.availabilityReview = "pending";
  }

  await persistCarpenterAccount(carpenter);
  return job;
}

export async function getPayoutSummary(carpenterId: string) {
  const dashboard = await getCarpenterDashboard(carpenterId);
  const allPayments = dashboard.jobs.flatMap((job) => job.payments);
  const now = Date.now();
  const weekAgo = now - 1000 * 60 * 60 * 24 * 7;
  const monthAgo = now - 1000 * 60 * 60 * 24 * 30;
  const yearAgo = now - 1000 * 60 * 60 * 24 * 365;

  const paid = allPayments.filter((p) => p.status === "paid");
  const scheduled = allPayments.filter((p) => p.status === "scheduled");

  const totalFor = (since: number) =>
    paid
      .filter((p) => new Date(p.paidAt).getTime() >= since)
      .reduce((sum, p) => sum + p.amountCents, 0);

  return {
    weekCents: totalFor(weekAgo),
    monthCents: totalFor(monthAgo),
    yearCents: totalFor(yearAgo),
    lifetimeCents: paid.reduce((sum, p) => sum + p.amountCents, 0),
    scheduledCents: scheduled.reduce((sum, p) => sum + p.amountCents, 0),
    nextExpectedPayment: scheduled[0]?.expectedAt || null,
  };
}
