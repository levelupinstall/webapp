import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Machine-to-machine email sync for the admin CRM.
 *
 * A scheduled job (Muse) reads the business Gmail mailbox and posts customer
 * emails here; they land in PortalUser.communicationLog, which the admin
 * dashboard already renders on each customer's profile.
 *
 * Auth: shared secret in EMAIL_SYNC_SECRET, passed as the
 * `x-email-sync-secret` header (or `secret` in the POST body).
 * This route is NOT part of the admin session flow on purpose — the sync job
 * has no browser session.
 */

function secretsEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return da.length === db.length && timingSafeEqual(da, db);
}

function isAuthorized(request: Request, bodySecret?: unknown): boolean {
  const expected = process.env.EMAIL_SYNC_SECRET?.trim();
  if (!expected) return false;
  const provided =
    request.headers.get("x-email-sync-secret")?.trim() ||
    (typeof bodySecret === "string" ? bodySecret.trim() : "");
  if (!provided) return false;
  return secretsEqual(provided, expected);
}

type CommEntry = {
  id?: string;
  channel?: string;
  summary?: string;
  detail?: string;
  sentAt?: string;
  recordedBy?: string;
};

/** List customers (id + email + already-synced email entry ids + estimates). */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const users = await prisma.portalUser.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      communicationLog: true,
      estimates: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const jobs = await prisma.job.findMany({
    select: { id: true, customerEmail: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    customers: users.map((u) => {
      const log = Array.isArray(u.communicationLog)
        ? (u.communicationLog as CommEntry[])
        : [];
      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName ?? "",
        syncedEntryIds: log
          .map((e) => (typeof e?.id === "string" ? e.id : ""))
          .filter(Boolean),
        estimates: Array.isArray(u.estimates) ? u.estimates : [],
      };
    }),
    jobs: jobs.map((j) => ({
      id: j.id,
      customerEmail: j.customerEmail ?? "",
      status: j.status,
      updatedAt: j.updatedAt.toISOString(),
    })),
  });
}

type IncomingEntry = {
  id: string;
  summary: string;
  detail?: string;
  sentAt: string;
};

/** Append email entries to a customer's communication log (dedupes by id). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    secret?: unknown;
    portalUserId?: unknown;
    entries?: unknown;
  };
  if (!isAuthorized(request, body.secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const portalUserId =
    typeof body.portalUserId === "string" ? body.portalUserId.trim() : "";
  const entries = Array.isArray(body.entries)
    ? (body.entries as IncomingEntry[])
    : [];
  if (!portalUserId || entries.length === 0) {
    return NextResponse.json(
      { error: "portalUserId and a non-empty entries array are required." },
      { status: 400 },
    );
  }

  const row = await prisma.portalUser.findUnique({
    where: { id: portalUserId },
    select: { id: true, communicationLog: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const log: CommEntry[] = Array.isArray(row.communicationLog)
    ? [...(row.communicationLog as CommEntry[])]
    : [];
  const existing = new Set(
    log.map((e) => (typeof e?.id === "string" ? e.id : "")).filter(Boolean),
  );

  let added = 0;
  for (const e of entries) {
    const id = typeof e?.id === "string" ? e.id.trim() : "";
    const summary = typeof e?.summary === "string" ? e.summary.trim() : "";
    const sentAt = typeof e?.sentAt === "string" ? e.sentAt.trim() : "";
    if (!id || !summary || !sentAt || existing.has(id)) continue;
    const detail =
      typeof e?.detail === "string" && e.detail.trim()
        ? e.detail.trim().slice(0, 4000)
        : undefined;
    log.unshift({
      id,
      channel: "email",
      summary: summary.slice(0, 300),
      ...(detail ? { detail } : {}),
      sentAt,
      recordedBy: "email-sync",
    });
    existing.add(id);
    added += 1;
  }

  if (added > 0) {
    await prisma.portalUser.update({
      where: { id: portalUserId },
      data: { communicationLog: log as unknown as object },
    });
  }
  return NextResponse.json({ ok: true, added });
}
