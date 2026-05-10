import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const jobId = id.trim();
  if (!jobId) {
    return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  }

  let body: {
    customerEmail?: string;
    customerPhone?: string;
    paymentAmountCents?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const data: {
    customerEmail?: string;
    customerPhone?: string;
    paymentAmountCents?: number | null;
  } = {};

  if (typeof body.customerEmail === "string") {
    data.customerEmail = body.customerEmail.trim();
  }
  if (typeof body.customerPhone === "string") {
    data.customerPhone = body.customerPhone.trim();
  }
  if (body.paymentAmountCents !== undefined) {
    if (body.paymentAmountCents === null) {
      data.paymentAmountCents = null;
    } else if (
      typeof body.paymentAmountCents === "number" &&
      Number.isFinite(body.paymentAmountCents)
    ) {
      data.paymentAmountCents = Math.round(body.paymentAmountCents);
    } else {
      return NextResponse.json({ error: "Invalid paymentAmountCents." }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  try {
    await prisma.job.update({
      where: { id: jobId },
      data,
    });
  } catch {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
