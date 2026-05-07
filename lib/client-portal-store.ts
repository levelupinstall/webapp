import { promises as fs } from "fs";
import path from "path";
import { randomInt, randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export type Idea = {
  id: string;
  title: string;
  notes: string;
  createdAt: string;
};

export type Invoice = {
  id: string;
  projectName: string;
  amountCents: number;
  status: "paid" | "due";
  issuedAt: string;
  stripeSessionId?: string;
  receiptEmail?: string;
  /** Call-out vs labour/material balance — drives Stripe Checkout metadata */
  billingKind?: "call_out" | "balance";
  /** Latest open Checkout session id while invoice is due (refreshed if expired) */
  pendingStripeSessionId?: string;
  /** Scope / pricing lines shown on PDF and in portal */
  lineItemsSummary?: string;
};

export type ProjectStatus = {
  phase: string;
  updatedAt: string;
  details: string;
};

export type CarpenterUpload = {
  id: string;
  type: "image" | "video";
  url: string;
  caption: string;
  uploadedAt: string;
};

export type AiPlannerActivity = {
  id: string;
  createdAt: string;
  promptPreview: string;
  replyPreview: string;
  intakeSummary: string;
  imageCount: number;
};

/** Logged when clients open key portal sections (approximates “views”). */
export type PortalAnalytics = {
  savedProjectsSectionOpens: number;
  spacePhotosSectionOpens: number;
};

/** Admin-logged outbound messages (email/SMS/app); automation can append later. */
export type ClientCommunicationEntry = {
  id: string;
  channel: "email" | "sms" | "app_notice";
  summary: string;
  detail?: string;
  sentAt: string;
  recordedBy?: string;
};

type UserRecord = {
  id: string;
  username: string;
  passwordHash: string;
  email: string;
  /** Mobile number for SMS verification (E.164 when set) */
  phone: string;
  /** Which channel the member chose for signup verification */
  verificationChannel?: "email" | "sms";
  signupVerificationPending: boolean;
  signupVerificationCodeHash: string;
  signupVerificationExpiresAt: string;
  accountVerifiedAt?: string;
  fullName: string;
  serviceAddress: string;
  avatarDataUrl: string;
  ideas: Idea[];
  invoices: Invoice[];
  projectStatus: ProjectStatus;
  carpenterUploads: CarpenterUpload[];
  /** Photos/videos of the space the client uploads for the crew */
  spacePhotos: CarpenterUpload[];
  aiPlannerActivity: AiPlannerActivity[];
  /** Successful portal password login (ISO); not updated on every page load */
  lastLoginAt?: string;
  portalAnalytics: PortalAnalytics;
  communicationLog: ClientCommunicationEntry[];
};

type PortalData = {
  users: UserRecord[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "client-portal.json");

const defaultData: PortalData = { users: [] };

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultData, null, 2), "utf8");
  }
}

function hydrateUser(user: UserRecord): UserRecord {
  return {
    ...user,
    phone: user.phone ?? "",
    signupVerificationPending: user.signupVerificationPending ?? false,
    signupVerificationCodeHash: user.signupVerificationCodeHash ?? "",
    signupVerificationExpiresAt: user.signupVerificationExpiresAt ?? "",
    carpenterUploads: user.carpenterUploads ?? [],
    spacePhotos: user.spacePhotos ?? [],
    aiPlannerActivity: user.aiPlannerActivity ?? [],
    invoices: user.invoices ?? [],
    portalAnalytics: user.portalAnalytics ?? {
      savedProjectsSectionOpens: 0,
      spacePhotosSectionOpens: 0,
    },
    communicationLog: user.communicationLog ?? [],
  };
}

async function readData(): Promise<PortalData> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw) as PortalData;
  parsed.users = parsed.users.map(hydrateUser);
  return parsed;
}

async function writeData(data: PortalData) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function findUserByUsername(username: string) {
  const data = await readData();
  return data.users.find(
    (user) => user.username.toLowerCase() === username.toLowerCase(),
  );
}

export async function createUser(params: {
  username: string;
  email: string;
  passwordHash: string;
  phone: string;
  verificationChannel: "email" | "sms";
}): Promise<{ user: UserRecord; verificationCode: string }> {
  const data = await readData();
  const existing = data.users.find(
    (user) => user.username.toLowerCase() === params.username.toLowerCase(),
  );
  if (existing) {
    throw new Error("Username already exists.");
  }

  const verificationCode = String(randomInt(100000, 1000000));
  const signupVerificationCodeHash = await bcrypt.hash(verificationCode, 10);
  const signupVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const now = new Date().toISOString();
  const newUser: UserRecord = {
    id: randomUUID(),
    username: params.username,
    email: params.email,
    passwordHash: params.passwordHash,
    phone: params.phone.trim(),
    verificationChannel: params.verificationChannel,
    signupVerificationPending: true,
    signupVerificationCodeHash,
    signupVerificationExpiresAt,
    fullName: "",
    serviceAddress: "",
    avatarDataUrl: "",
    ideas: [],
    invoices: [],
    projectStatus: {
      phase: "Planning",
      updatedAt: now,
      details: "Account created. Awaiting project details and booking confirmation.",
    },
    carpenterUploads: [],
    spacePhotos: [],
    aiPlannerActivity: [],
    lastLoginAt: undefined,
    portalAnalytics: {
      savedProjectsSectionOpens: 0,
      spacePhotosSectionOpens: 0,
    },
    communicationLog: [],
  };

  data.users.push(newUser);
  await writeData(data);
  return { user: newUser, verificationCode };
}

export async function completePortalSignupVerification(params: {
  userId: string;
  code: string;
}): Promise<boolean> {
  const data = await readData();
  const user = data.users.find((item) => item.id === params.userId);
  if (!user?.signupVerificationPending) return false;
  if (!user.signupVerificationCodeHash) return false;
  const expires = user.signupVerificationExpiresAt
    ? new Date(user.signupVerificationExpiresAt)
    : null;
  if (!expires || expires.getTime() < Date.now()) return false;

  const ok = await bcrypt.compare(params.code.trim(), user.signupVerificationCodeHash);
  if (!ok) return false;

  user.signupVerificationPending = false;
  user.signupVerificationCodeHash = "";
  user.signupVerificationExpiresAt = "";
  user.accountVerifiedAt = new Date().toISOString();
  await writeData(data);
  return true;
}

/** Returns a new plain verification code, or null if the user is not awaiting verification. */
export async function regeneratePortalSignupVerificationCode(userId: string): Promise<string | null> {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user?.signupVerificationPending) return null;

  const verificationCode = String(randomInt(100000, 1000000));
  user.signupVerificationCodeHash = await bcrypt.hash(verificationCode, 10);
  user.signupVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await writeData(data);
  return verificationCode;
}

/** Removes a portal user by id (e.g. rollback failed signup delivery). */
export async function deletePortalUserById(userId: string): Promise<boolean> {
  const data = await readData();
  const before = data.users.length;
  data.users = data.users.filter((item) => item.id !== userId);
  if (data.users.length === before) return false;
  await writeData(data);
  return true;
}

export async function addPaidInvoiceByEmail(params: {
  email: string;
  projectName: string;
  amountCents: number;
  stripeSessionId: string;
}) {
  const data = await readData();
  const user = data.users.find((item) => item.email.toLowerCase() === params.email.toLowerCase());
  if (!user) return null;

  const existing = user.invoices.find((invoice) => invoice.stripeSessionId === params.stripeSessionId);
  if (existing) return existing;

  const invoice: Invoice = {
    id: `inv-${Math.floor(Math.random() * 900000 + 100000)}`,
    projectName: params.projectName,
    amountCents: params.amountCents,
    status: "paid",
    issuedAt: new Date().toISOString(),
    stripeSessionId: params.stripeSessionId,
    receiptEmail: params.email,
    billingKind: "call_out",
  };
  user.invoices.unshift(invoice);
  await writeData(data);
  return invoice;
}

export async function addPaidInvoiceByUserId(params: {
  userId: string;
  receiptEmail?: string;
  projectName: string;
  amountCents: number;
  stripeSessionId: string;
}) {
  const data = await readData();
  const user = data.users.find((item) => item.id === params.userId);
  if (!user) return null;

  const existing = user.invoices.find((invoice) => invoice.stripeSessionId === params.stripeSessionId);
  if (existing) return existing;

  const invoice: Invoice = {
    id: `inv-${Math.floor(Math.random() * 900000 + 100000)}`,
    projectName: params.projectName,
    amountCents: params.amountCents,
    status: "paid",
    issuedAt: new Date().toISOString(),
    stripeSessionId: params.stripeSessionId,
    receiptEmail: params.receiptEmail,
    billingKind: "call_out",
  };
  user.invoices.unshift(invoice);
  await writeData(data);
  return invoice;
}

/** Phase 2: labour/materials/strike balance — client pays via portal Stripe Checkout */
export async function createDueBalanceInvoice(params: {
  portalUserId: string;
  projectName: string;
  amountCents: number;
  lineItemsSummary?: string;
}): Promise<Invoice> {
  if (!Number.isFinite(params.amountCents) || params.amountCents < 1) {
    throw new Error("amountCents must be a positive integer.");
  }
  const data = await readData();
  const user = data.users.find((item) => item.id === params.portalUserId);
  if (!user) throw new Error("Portal user not found.");

  const invoice: Invoice = {
    id: randomUUID(),
    projectName: params.projectName.trim() || "Project balance",
    amountCents: Math.round(params.amountCents),
    status: "due",
    issuedAt: new Date().toISOString(),
    billingKind: "balance",
    lineItemsSummary: params.lineItemsSummary?.trim() || undefined,
  };
  user.invoices.unshift(invoice);
  await writeData(data);
  return invoice;
}

export async function setBalanceInvoicePendingSession(
  portalUserId: string,
  invoiceId: string,
  stripeSessionId: string | undefined,
) {
  const data = await readData();
  const user = data.users.find((item) => item.id === portalUserId);
  if (!user) throw new Error("Portal user not found.");
  const inv = user.invoices.find((item) => item.id === invoiceId);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "due") throw new Error("Invoice is not payable.");
  if (stripeSessionId === undefined) {
    delete inv.pendingStripeSessionId;
  } else {
    inv.pendingStripeSessionId = stripeSessionId;
  }
  await writeData(data);
  return inv;
}

/** Idempotent: marks balance invoice paid from Stripe Checkout completion */
export async function markBalanceInvoicePaid(params: {
  portalUserId: string;
  invoiceId: string;
  stripeSessionId: string;
  paidAmountCents: number;
}): Promise<Invoice | null> {
  const data = await readData();
  const user = data.users.find((item) => item.id === params.portalUserId);
  if (!user) return null;
  const inv = user.invoices.find((item) => item.id === params.invoiceId);
  if (!inv) return null;
  if (inv.status === "paid") return inv;
  if (inv.status !== "due") return null;

  const paidExact =
    inv.amountCents === params.paidAmountCents ||
    Math.abs(inv.amountCents - params.paidAmountCents) < 1;

  if (!paidExact) {
    throw new Error(
      `Stripe paid amount (${params.paidAmountCents}) does not match invoice (${inv.amountCents}).`,
    );
  }

  inv.status = "paid";
  inv.stripeSessionId = params.stripeSessionId;
  delete inv.pendingStripeSessionId;
  await writeData(data);
  return inv;
}

export async function addIdeaForUser(userId: string, params: Omit<Idea, "id" | "createdAt">) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");

  const idea: Idea = {
    id: randomUUID(),
    title: params.title,
    notes: params.notes,
    createdAt: new Date().toISOString(),
  };
  user.ideas.unshift(idea);
  await writeData(data);
  return idea;
}

export async function addClientSpacePhoto(
  userId: string,
  params: { type: "image" | "video"; url: string; caption: string },
) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");

  const upload: CarpenterUpload = {
    id: randomUUID(),
    type: params.type,
    url: params.url,
    caption: params.caption.trim() || "Space photo",
    uploadedAt: new Date().toISOString(),
  };
  user.spacePhotos = user.spacePhotos ?? [];
  user.spacePhotos.unshift(upload);
  await writeData(data);
  return upload;
}

export async function recordPortalLogin(userId: string) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return;
  user.lastLoginAt = new Date().toISOString();
  await writeData(data);
}

export async function incrementPortalAnalytics(
  userId: string,
  kind: keyof Pick<PortalAnalytics, "savedProjectsSectionOpens" | "spacePhotosSectionOpens">,
) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return;
  user.portalAnalytics = user.portalAnalytics ?? {
    savedProjectsSectionOpens: 0,
    spacePhotosSectionOpens: 0,
  };
  user.portalAnalytics[kind] = (user.portalAnalytics[kind] ?? 0) + 1;
  await writeData(data);
}

export async function appendPortalCommunication(params: {
  portalUserId: string;
  channel: ClientCommunicationEntry["channel"];
  summary: string;
  detail?: string;
  recordedBy?: string;
}) {
  const data = await readData();
  const user = data.users.find((item) => item.id === params.portalUserId);
  if (!user) throw new Error("Portal user not found.");

  const entry: ClientCommunicationEntry = {
    id: randomUUID(),
    channel: params.channel,
    summary: params.summary.trim(),
    detail: params.detail?.trim() || undefined,
    sentAt: new Date().toISOString(),
    recordedBy: params.recordedBy?.trim() || undefined,
  };
  user.communicationLog = user.communicationLog ?? [];
  user.communicationLog.unshift(entry);
  await writeData(data);
  return entry;
}

export async function getUserPortalData(userId: string) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    serviceAddress: user.serviceAddress,
    avatarDataUrl: user.avatarDataUrl,
    ideas: user.ideas,
    invoices: user.invoices,
    projectStatus: user.projectStatus,
    carpenterUploads: user.carpenterUploads || [],
    spacePhotos: user.spacePhotos || [],
    aiPlannerActivity: user.aiPlannerActivity || [],
  };
}

export async function appendAiPlannerActivity(
  userId: string,
  entry: Omit<AiPlannerActivity, "id" | "createdAt">,
) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;

  const activity: AiPlannerActivity = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  user.aiPlannerActivity.unshift(activity);
  await writeData(data);
  return activity;
}

export async function listPortalUsersForAdmin() {
  const data = await readData();
  return data.users.map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone ?? "",
    fullName: user.fullName,
    serviceAddress: user.serviceAddress,
    avatarDataUrl: user.avatarDataUrl,
    ideas: user.ideas,
    invoices: user.invoices,
    projectStatus: user.projectStatus,
    carpenterUploads: user.carpenterUploads || [],
    spacePhotos: user.spacePhotos || [],
    aiPlannerActivity: user.aiPlannerActivity || [],
    lastLoginAt: user.lastLoginAt ?? null,
    portalAnalytics: user.portalAnalytics ?? {
      savedProjectsSectionOpens: 0,
      spacePhotosSectionOpens: 0,
    },
    communicationLog: user.communicationLog ?? [],
  }));
}

export async function updateUserProfile(
  userId: string,
  profile: { fullName: string; serviceAddress: string; avatarDataUrl: string },
) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");

  user.fullName = profile.fullName;
  user.serviceAddress = profile.serviceAddress;
  user.avatarDataUrl = profile.avatarDataUrl;
  await writeData(data);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    serviceAddress: user.serviceAddress,
    avatarDataUrl: user.avatarDataUrl,
    ideas: user.ideas,
    invoices: user.invoices,
    projectStatus: user.projectStatus,
    carpenterUploads: user.carpenterUploads || [],
    spacePhotos: user.spacePhotos || [],
    aiPlannerActivity: user.aiPlannerActivity || [],
  };
}

export async function getPortalUserById(userId: string) {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    serviceAddress: user.serviceAddress,
    phone: user.phone ?? "",
    avatarDataUrl: user.avatarDataUrl,
  };
}

