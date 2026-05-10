import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { listPortalUsersForAdmin } from "@/lib/client-portal-store";
import { listCarpentersForAdmin, type CarpenterJob } from "@/lib/carpenter-store";
import { prisma } from "@/lib/prisma";
import { listWorkRequestsForAdmin } from "@/lib/work-requests-store";

type ActivityItem = {
  id: string;
  createdAt: string;
  type: "ai_planner" | "job_assigned" | "job_status" | "receipt_uploaded";
  title: string;
  detail: string;
  clientName?: string;
  carpenterName?: string;
  jobTitle?: string;
};

function receiptsTotalCents(job: CarpenterJob) {
  return job.receipts.reduce((sum, r) => sum + r.amountCents, 0);
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [clients, carpenters, workRequests, structuredJobsPending] = await Promise.all([
    listPortalUsersForAdmin(),
    listCarpentersForAdmin(),
    listWorkRequestsForAdmin(),
    prisma.job.findMany({
      where: {
        status: { in: ["PENDING_REVIEW", "APPROVED_PENDING_PAYMENT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        status: true,
        customerPhone: true,
        customerEmail: true,
        portalUserId: true,
        width: true,
        height: true,
        depth: true,
        dwellingType: true,
        immediateCharge: true,
        paymentAmountCents: true,
        guestPayToken: true,
        stripeCheckoutSessionId: true,
        assignedCarpenterId: true,
      },
    }),
  ]);

  const jobs = carpenters.flatMap((c) =>
    c.jobs.map((job) => ({
      ...job,
      carpenterId: c.id,
      carpenterUsername: c.username,
      carpenterFullName: c.fullName,
      receiptsTotalCents: receiptsTotalCents(job),
      receiptCount: job.receipts.length,
    })),
  );

  jobs.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const activityFeed: ActivityItem[] = [];

  for (const client of clients) {
    const clientName = client.fullName || client.username;
    for (const activity of client.aiPlannerActivity) {
      activityFeed.push({
        id: `ai-${activity.id}`,
        createdAt: activity.createdAt,
        type: "ai_planner",
        title: "Client used AI Planner",
        detail: activity.promptPreview,
        clientName,
      });
    }
  }

  for (const job of jobs) {
    const carpenterName = job.carpenterFullName || job.carpenterUsername;
    activityFeed.push({
      id: `job-${job.id}`,
      createdAt: job.startDate,
      type: "job_assigned",
      title: "Job assigned",
      detail: `${job.client.name} -> ${carpenterName}`,
      clientName: job.client.name,
      carpenterName,
      jobTitle: job.title,
    });

    if (job.status === "completed") {
      activityFeed.push({
        id: `status-${job.id}`,
        createdAt: job.startDate,
        type: "job_status",
        title: "Job completed",
        detail: `${job.title} completed by ${carpenterName}`,
        clientName: job.client.name,
        carpenterName,
        jobTitle: job.title,
      });
    }

    for (const receipt of job.receipts) {
      activityFeed.push({
        id: `receipt-${receipt.id}`,
        createdAt: receipt.createdAt,
        type: "receipt_uploaded",
        title: "Receipt uploaded",
        detail: `${receipt.title} (${receipt.amountCents / 100} USD)`,
        clientName: job.client.name,
        carpenterName,
        jobTitle: job.title,
      });
    }
  }

  activityFeed.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return NextResponse.json({
    clients,
    carpenters,
    jobs,
    activityFeed,
    workRequests,
    structuredJobsPending,
  });
}
