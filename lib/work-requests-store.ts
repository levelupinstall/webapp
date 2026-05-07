import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type WorkRequestJobPlan = {
  materials: string[];
  tools: string[];
  crewSize: number;
  notes: string;
  generatedAt: string;
};

export type WorkRequest = {
  id: string;
  createdAt: string;
  status: "new" | "reviewing" | "assigned" | "closed";
  source: "booking";
  fullName: string;
  email: string;
  phone: string;
  projectAddress: string;
  preferredDate: string;
  projectDetails: string;
  signatureName: string;
  stripeSessionId: string;
  paidAmountCents: number;
  portalUserId: string;
  jobPlan?: WorkRequestJobPlan;
};

type WorkRequestsData = {
  requests: WorkRequest[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "work-requests.json");

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const empty: WorkRequestsData = { requests: [] };
    await fs.writeFile(DATA_FILE, JSON.stringify(empty, null, 2), "utf8");
  }
}

async function readData(): Promise<WorkRequestsData> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw) as WorkRequestsData;
  if (!Array.isArray(parsed.requests)) parsed.requests = [];
  return parsed;
}

async function writeData(data: WorkRequestsData) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function upsertWorkRequestFromPaidBooking(params: {
  stripeSessionId: string;
  paidAmountCents: number;
  fullName: string;
  email: string;
  phone: string;
  projectAddress: string;
  preferredDate: string;
  projectDetails: string;
  signatureName: string;
  portalUserId: string;
}) {
  const data = await readData();
  const existing = data.requests.find((r) => r.stripeSessionId === params.stripeSessionId);
  if (existing) {
    existing.paidAmountCents = params.paidAmountCents;
    existing.fullName = params.fullName;
    existing.email = params.email;
    existing.phone = params.phone;
    existing.projectAddress = params.projectAddress;
    existing.preferredDate = params.preferredDate;
    existing.projectDetails = params.projectDetails;
    existing.signatureName = params.signatureName;
    existing.portalUserId = params.portalUserId;
    await writeData(data);
    return existing;
  }

  const now = new Date().toISOString();
  const req: WorkRequest = {
    id: randomUUID(),
    createdAt: now,
    status: "new",
    source: "booking",
    fullName: params.fullName,
    email: params.email,
    phone: params.phone,
    projectAddress: params.projectAddress,
    preferredDate: params.preferredDate,
    projectDetails: params.projectDetails,
    signatureName: params.signatureName,
    stripeSessionId: params.stripeSessionId,
    paidAmountCents: params.paidAmountCents,
    portalUserId: params.portalUserId,
  };
  data.requests.unshift(req);
  await writeData(data);
  return req;
}

export async function listWorkRequestsForAdmin(): Promise<WorkRequest[]> {
  const data = await readData();
  return [...data.requests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getWorkRequestById(id: string): Promise<WorkRequest | null> {
  const data = await readData();
  return data.requests.find((r) => r.id === id) || null;
}

export async function updateWorkRequestJobPlan(id: string, plan: WorkRequestJobPlan) {
  const data = await readData();
  const req = data.requests.find((r) => r.id === id);
  if (!req) throw new Error("Work request not found.");
  req.jobPlan = plan;
  await writeData(data);
  return req;
}

export async function updateWorkRequestStatus(id: string, status: WorkRequest["status"]) {
  const data = await readData();
  const req = data.requests.find((r) => r.id === id);
  if (!req) throw new Error("Work request not found.");
  req.status = status;
  await writeData(data);
  return req;
}
