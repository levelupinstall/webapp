import type { PortalUser as PortalUserRow } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { randomBytes, randomInt, randomUUID } from "crypto";
import bcrypt from "bcryptjs";

import { unlinkPortalUserFromAllCarpenterJobs } from "@/lib/carpenter-store";
import { hashPasswordResetToken } from "@/lib/password-reset-token";
import { prisma } from "@/lib/prisma";

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
  billingKind?: "call_out" | "balance";
  pendingStripeSessionId?: string;
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

export type PortalAnalytics = {
  savedProjectsSectionOpens: number;
  spacePhotosSectionOpens: number;
};

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
  phone: string;
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
  spacePhotos: CarpenterUpload[];
  aiPlannerActivity: AiPlannerActivity[];
  lastLoginAt?: string;
  portalAnalytics: PortalAnalytics;
  communicationLog: ClientCommunicationEntry[];
};

function parseIdeas(value: Prisma.JsonValue): Idea[] {
  return Array.isArray(value) ? (value as unknown as Idea[]) : [];
}

function parseInvoices(value: Prisma.JsonValue): Invoice[] {
  return Array.isArray(value) ? (value as unknown as Invoice[]) : [];
}

function parseUploads(value: Prisma.JsonValue): CarpenterUpload[] {
  return Array.isArray(value) ? (value as unknown as CarpenterUpload[]) : [];
}

function parseAiActivity(value: Prisma.JsonValue): AiPlannerActivity[] {
  return Array.isArray(value) ? (value as unknown as AiPlannerActivity[]) : [];
}

function parseCommunicationLog(value: Prisma.JsonValue): ClientCommunicationEntry[] {
  return Array.isArray(value) ? (value as unknown as ClientCommunicationEntry[]) : [];
}

function parseProjectStatus(value: Prisma.JsonValue): ProjectStatus {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      phase: String(o.phase ?? "Planning"),
      updatedAt: String(o.updatedAt ?? new Date().toISOString()),
      details: String(o.details ?? ""),
    };
  }
  const now = new Date().toISOString();
  return {
    phase: "Planning",
    updatedAt: now,
    details: "Account created. Awaiting project details and booking confirmation.",
  };
}

function parsePortalAnalytics(value: Prisma.JsonValue): PortalAnalytics {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      savedProjectsSectionOpens: Number(o.savedProjectsSectionOpens ?? 0),
      spacePhotosSectionOpens: Number(o.spacePhotosSectionOpens ?? 0),
    };
  }
  return { savedProjectsSectionOpens: 0, spacePhotosSectionOpens: 0 };
}

function rowToUserRecord(row: PortalUserRow): UserRecord {
  return hydrateUser({
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    email: row.email,
    phone: row.phone ?? "",
    verificationChannel: row.verificationChannel as UserRecord["verificationChannel"],
    signupVerificationPending: row.signupVerificationPending,
    signupVerificationCodeHash: row.signupVerificationCodeHash ?? "",
    signupVerificationExpiresAt: row.signupVerificationExpiresAt?.toISOString() ?? "",
    accountVerifiedAt: row.accountVerifiedAt?.toISOString(),
    fullName: row.fullName,
    serviceAddress: row.serviceAddress,
    avatarDataUrl: row.avatarDataUrl,
    ideas: parseIdeas(row.ideas),
    invoices: parseInvoices(row.invoices),
    projectStatus: parseProjectStatus(row.projectStatus),
    carpenterUploads: parseUploads(row.carpenterUploads),
    spacePhotos: parseUploads(row.spacePhotos),
    aiPlannerActivity: parseAiActivity(row.aiPlannerActivity),
    lastLoginAt: row.lastLoginAt?.toISOString(),
    portalAnalytics: parsePortalAnalytics(row.portalAnalytics),
    communicationLog: parseCommunicationLog(row.communicationLog),
  });
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

async function persistJsonSnapshots(
  userId: string,
  snapshot: Pick<
    Prisma.PortalUserUpdateInput,
    | "ideas"
    | "invoices"
    | "projectStatus"
    | "carpenterUploads"
    | "spacePhotos"
    | "aiPlannerActivity"
    | "portalAnalytics"
    | "communicationLog"
  >,
) {
  await prisma.portalUser.update({
    where: { id: userId },
    data: snapshot,
  });
}

export async function findUserByUsername(username: string) {
  const row = await prisma.portalUser.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  return row ? rowToUserRecord(row) : undefined;
}

/** Login identifier: email address (preferred) or legacy username. */
export async function findPortalUserForLogin(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("@")) {
    const byEmail = await findPortalUserByEmail(trimmed.toLowerCase());
    if (byEmail) return byEmail;
  }
  return findUserByUsername(trimmed);
}

export async function findPortalUserByEmail(email: string) {
  const row = await prisma.portalUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  return row ? rowToUserRecord(row) : undefined;
}

/**
 * Verified portal accounts only. Saves hashed token + expiry; returns plaintext token for the email link.
 */
export async function beginPortalPasswordReset(
  email: string,
): Promise<{
  plainToken: string;
  username: string;
  toEmail: string;
  userId: string;
} | null> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;

  const row = await prisma.portalUser.findUnique({ where: { email: normalized } });
  if (!row || row.signupVerificationPending) return null;

  const plainToken = randomBytes(32).toString("base64url");
  const hash = hashPasswordResetToken(plainToken);

  await prisma.portalUser.update({
    where: { id: row.id },
    data: {
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return {
    plainToken,
    username: row.fullName.trim() || row.username,
    toEmail: row.email,
    userId: row.id,
  };
}

export async function clearPortalPasswordResetChallenge(userId: string): Promise<void> {
  await prisma.portalUser.update({
    where: { id: userId },
    data: {
      passwordResetTokenHash: "",
      passwordResetExpiresAt: null,
    },
  });
}

export async function finishPortalPasswordReset(
  plainToken: string,
  newPasswordHash: string,
): Promise<boolean> {
  const trimmed = plainToken.trim();
  if (!trimmed) return false;
  const hash = hashPasswordResetToken(trimmed);

  const row = await prisma.portalUser.findFirst({
    where: {
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: { gt: new Date() },
    },
  });
  if (!row) return false;

  await prisma.portalUser.update({
    where: { id: row.id },
    data: {
      passwordHash: newPasswordHash,
      passwordResetTokenHash: "",
      passwordResetExpiresAt: null,
    },
  });
  return true;
}

export async function createUser(params: {
  email: string;
  fullName: string;
  passwordHash: string;
  phone: string;
  verificationChannel: "email" | "sms";
  signupLocationLog?: Prisma.InputJsonValue;
}): Promise<{ user: UserRecord; verificationCode: string | null }> {
  const emailNormalized = params.email.trim().toLowerCase();
  const username = emailNormalized;
  const fullNameTrimmed = params.fullName.trim();

  const existingEmail = await prisma.portalUser.findUnique({
    where: { email: emailNormalized },
  });
  if (existingEmail) {
    throw new Error("Email already registered.");
  }

  const signupVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let verificationCode: string | null = null;
  let signupVerificationCodeHash = "";

  if (params.verificationChannel === "sms") {
    verificationCode = String(randomInt(100000, 1000000));
    signupVerificationCodeHash = await bcrypt.hash(verificationCode, 10);
  }

  const now = new Date().toISOString();
  const projectStatusPayload = {
    phase: "Planning",
    updatedAt: now,
    details: "Account created. Awaiting project details and booking confirmation.",
  };
  const portalAnalyticsPayload = {
    savedProjectsSectionOpens: 0,
    spacePhotosSectionOpens: 0,
  };

  try {
    const row = await prisma.portalUser.create({
      data: {
        username,
        email: emailNormalized,
        passwordHash: params.passwordHash,
        phone: params.phone.trim(),
        verificationChannel: params.verificationChannel,
        signupVerificationPending: true,
        signupVerificationCodeHash,
        signupVerificationExpiresAt,
        fullName: fullNameTrimmed,
        serviceAddress: "",
        avatarDataUrl: "",
        ideas: [],
        invoices: [],
        projectStatus: projectStatusPayload,
        carpenterUploads: [],
        spacePhotos: [],
        aiPlannerActivity: [],
        portalAnalytics: portalAnalyticsPayload,
        communicationLog: [],
        ...(params.signupLocationLog !== undefined
          ? { signupLocationLog: params.signupLocationLog }
          : {}),
      },
    });
    return { user: rowToUserRecord(row), verificationCode };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const targets = error.meta?.target as string[] | undefined;
      if (targets?.some((t) => String(t).toLowerCase().includes("email"))) {
        throw new Error("Email already registered.");
      }
      throw new Error("That email is already registered.");
    }
    throw error;
  }
}

export async function completePortalSignupVerificationFromMagicLink(
  userId: string,
): Promise<{ ok: true; username: string } | { ok: false }> {
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row?.signupVerificationPending) return { ok: false };
  if ((row.verificationChannel ?? "email") !== "email") return { ok: false };
  const expires = row.signupVerificationExpiresAt;
  if (!expires || expires.getTime() < Date.now()) return { ok: false };

  await prisma.portalUser.update({
    where: { id: userId },
    data: {
      signupVerificationPending: false,
      signupVerificationCodeHash: "",
      signupVerificationExpiresAt: null,
      accountVerifiedAt: new Date(),
    },
  });
  return { ok: true, username: row.username };
}

export async function completePortalSignupVerification(params: {
  userId: string;
  code: string;
}): Promise<boolean> {
  const row = await prisma.portalUser.findUnique({ where: { id: params.userId } });
  if (!row?.signupVerificationPending) return false;
  if (!row.signupVerificationCodeHash) return false;
  const expires = row.signupVerificationExpiresAt;
  if (!expires || expires.getTime() < Date.now()) return false;

  const ok = await bcrypt.compare(params.code.trim(), row.signupVerificationCodeHash);
  if (!ok) return false;

  await prisma.portalUser.update({
    where: { id: params.userId },
    data: {
      signupVerificationPending: false,
      signupVerificationCodeHash: "",
      signupVerificationExpiresAt: null,
      accountVerifiedAt: new Date(),
    },
  });
  return true;
}

export async function regeneratePortalSignupVerificationCode(
  userId: string,
): Promise<string | null> {
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row?.signupVerificationPending) return null;

  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if ((row.verificationChannel ?? "email") === "email") {
    await prisma.portalUser.update({
      where: { id: userId },
      data: {
        signupVerificationCodeHash: "",
        signupVerificationExpiresAt: expires,
      },
    });
    return null;
  }

  const verificationCode = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(verificationCode, 10);
  await prisma.portalUser.update({
    where: { id: userId },
    data: {
      signupVerificationCodeHash: hash,
      signupVerificationExpiresAt: expires,
    },
  });
  return verificationCode;
}

export async function deletePortalUserById(userId: string): Promise<boolean> {
  try {
    await prisma.portalUser.delete({ where: { id: userId } });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return false;
    }
    throw error;
  }
}

/** Admin-only: portal login row + CRM-linked booking rows + job portal links; carpenter jobs stay with anonymized link. */
export async function deletePortalUserAccountFully(portalUserId: string): Promise<boolean> {
  await prisma.adminWorkRequest.deleteMany({ where: { portalUserId } });
  await unlinkPortalUserFromAllCarpenterJobs(portalUserId);
  return deletePortalUserById(portalUserId);
}

export async function addPaidInvoiceByEmail(params: {
  email: string;
  projectName: string;
  amountCents: number;
  stripeSessionId: string;
}) {
  const row = await prisma.portalUser.findUnique({
    where: { email: params.email.toLowerCase() },
  });
  if (!row) return null;

  const user = rowToUserRecord(row);
  const existing = user.invoices.find(
    (invoice) => invoice.stripeSessionId === params.stripeSessionId,
  );
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
  await persistJsonSnapshots(row.id, {
    invoices: user.invoices as unknown as Prisma.InputJsonValue,
  });
  return invoice;
}

export async function addPaidInvoiceByUserId(params: {
  userId: string;
  receiptEmail?: string;
  projectName: string;
  amountCents: number;
  stripeSessionId: string;
}) {
  const row = await prisma.portalUser.findUnique({ where: { id: params.userId } });
  if (!row) return null;

  const user = rowToUserRecord(row);
  const existing = user.invoices.find(
    (invoice) => invoice.stripeSessionId === params.stripeSessionId,
  );
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
  await persistJsonSnapshots(row.id, {
    invoices: user.invoices as unknown as Prisma.InputJsonValue,
  });
  return invoice;
}

export async function createDueBalanceInvoice(params: {
  portalUserId: string;
  projectName: string;
  amountCents: number;
  lineItemsSummary?: string;
}): Promise<Invoice> {
  if (!Number.isFinite(params.amountCents) || params.amountCents < 1) {
    throw new Error("amountCents must be a positive integer.");
  }
  const row = await prisma.portalUser.findUnique({ where: { id: params.portalUserId } });
  if (!row) throw new Error("Portal user not found.");

  const user = rowToUserRecord(row);
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
  await persistJsonSnapshots(row.id, {
    invoices: user.invoices as unknown as Prisma.InputJsonValue,
  });
  return invoice;
}

export async function setBalanceInvoicePendingSession(
  portalUserId: string,
  invoiceId: string,
  stripeSessionId: string | undefined,
) {
  const row = await prisma.portalUser.findUnique({ where: { id: portalUserId } });
  if (!row) throw new Error("Portal user not found.");
  const user = rowToUserRecord(row);
  const inv = user.invoices.find((item) => item.id === invoiceId);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "due") throw new Error("Invoice is not payable.");
  if (stripeSessionId === undefined) {
    delete inv.pendingStripeSessionId;
  } else {
    inv.pendingStripeSessionId = stripeSessionId;
  }
  await persistJsonSnapshots(row.id, {
    invoices: user.invoices as unknown as Prisma.InputJsonValue,
  });
  return inv;
}

export async function markBalanceInvoicePaid(params: {
  portalUserId: string;
  invoiceId: string;
  stripeSessionId: string;
  paidAmountCents: number;
}): Promise<Invoice | null> {
  const row = await prisma.portalUser.findUnique({ where: { id: params.portalUserId } });
  if (!row) return null;
  const user = rowToUserRecord(row);
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
  await persistJsonSnapshots(row.id, {
    invoices: user.invoices as unknown as Prisma.InputJsonValue,
  });
  return inv;
}

export async function addIdeaForUser(userId: string, params: Omit<Idea, "id" | "createdAt">) {
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row) throw new Error("User not found.");

  const user = rowToUserRecord(row);
  const idea: Idea = {
    id: randomUUID(),
    title: params.title,
    notes: params.notes,
    createdAt: new Date().toISOString(),
  };
  user.ideas.unshift(idea);
  await persistJsonSnapshots(row.id, {
    ideas: user.ideas as unknown as Prisma.InputJsonValue,
  });
  return idea;
}

export async function addClientSpacePhoto(
  userId: string,
  params: { type: "image" | "video"; url: string; caption: string },
) {
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row) throw new Error("User not found.");

  const user = rowToUserRecord(row);
  const upload: CarpenterUpload = {
    id: randomUUID(),
    type: params.type,
    url: params.url,
    caption: params.caption.trim() || "Space photo",
    uploadedAt: new Date().toISOString(),
  };
  user.spacePhotos = user.spacePhotos ?? [];
  user.spacePhotos.unshift(upload);
  await persistJsonSnapshots(row.id, {
    spacePhotos: user.spacePhotos as unknown as Prisma.InputJsonValue,
  });
  return upload;
}

export async function recordPortalLogin(userId: string) {
  await prisma.portalUser.updateMany({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

export async function incrementPortalAnalytics(
  userId: string,
  kind: keyof Pick<PortalAnalytics, "savedProjectsSectionOpens" | "spacePhotosSectionOpens">,
) {
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row) return;
  const user = rowToUserRecord(row);
  user.portalAnalytics = user.portalAnalytics ?? {
    savedProjectsSectionOpens: 0,
    spacePhotosSectionOpens: 0,
  };
  user.portalAnalytics[kind] = (user.portalAnalytics[kind] ?? 0) + 1;
  await persistJsonSnapshots(row.id, {
    portalAnalytics: user.portalAnalytics as unknown as Prisma.InputJsonValue,
  });
}

export async function appendPortalCommunication(params: {
  portalUserId: string;
  channel: ClientCommunicationEntry["channel"];
  summary: string;
  detail?: string;
  recordedBy?: string;
}) {
  const row = await prisma.portalUser.findUnique({ where: { id: params.portalUserId } });
  if (!row) throw new Error("Portal user not found.");

  const user = rowToUserRecord(row);
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
  await persistJsonSnapshots(row.id, {
    communicationLog: user.communicationLog as unknown as Prisma.InputJsonValue,
  });
  return entry;
}

export async function getUserPortalData(userId: string) {
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row) throw new Error("User not found.");
  if (row.signupVerificationPending) {
    throw new Error("Account verification pending.");
  }
  const user = rowToUserRecord(row);
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
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row) return null;

  const user = rowToUserRecord(row);
  const activity: AiPlannerActivity = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  user.aiPlannerActivity.unshift(activity);
  await persistJsonSnapshots(row.id, {
    aiPlannerActivity: user.aiPlannerActivity as unknown as Prisma.InputJsonValue,
  });
  return activity;
}

export async function listPortalUsersForAdmin() {
  const rows = await prisma.portalUser.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((row) => {
    const user = rowToUserRecord(row);
    return {
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
      signupLocationLog: row.signupLocationLog ?? null,
    };
  });
}

export async function updateUserProfile(
  userId: string,
  profile: { fullName: string; serviceAddress: string; avatarDataUrl: string },
) {
  let updated: PortalUserRow;
  try {
    updated = await prisma.portalUser.update({
      where: { id: userId },
      data: {
        fullName: profile.fullName,
        serviceAddress: profile.serviceAddress,
        avatarDataUrl: profile.avatarDataUrl,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new Error("User not found.");
    }
    throw error;
  }

  const user = rowToUserRecord(updated);

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
  const row = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!row) return null;
  const user = rowToUserRecord(row);
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
