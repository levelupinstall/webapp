import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getSessionFromCookie } from "@/lib/client-portal-auth";
import { getUserPortalData } from "@/lib/client-portal-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const user = await getUserPortalData(session.userId);
  const invoice = user.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Level Up Install", {
    x: 50,
    y: 790,
    size: 24,
    font: boldFont,
    color: rgb(0.24, 0.11, 0.38),
  });
  page.drawText("Invoice", { x: 50, y: 760, size: 16, font: boldFont });

  const lines = [
    `Invoice ID: ${invoice.id}`,
    `Client: ${user.fullName?.trim() || user.email}`,
    `Project: ${invoice.projectName}`,
    `Amount: $${(invoice.amountCents / 100).toFixed(2)} CAD`,
    `Status: ${invoice.status.toUpperCase()}`,
    `Issued: ${new Date(invoice.issuedAt).toLocaleDateString("en-CA")}`,
    `Billing Email: ${user.email}`,
  ];

  const summary = invoice.lineItemsSummary?.trim();
  if (summary) {
    lines.push("", "Details:");
    for (const row of summary.split(/\r?\n/).slice(0, 28)) {
      const trimmed = row.trim().slice(0, 110);
      if (trimmed) lines.push(`  ${trimmed}`);
    }
  }

  let y = 720;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= line === "" ? 12 : 22;
    if (y < 80) break;
  }

  page.drawText("Thank you for choosing Level Up Install.", {
    x: 50,
    y: Math.max(72, y - 24),
    size: 12,
    font: boldFont,
    color: rgb(0.24, 0.11, 0.38),
  });

  const pdfBytes = await pdfDoc.save();
  const pdfArrayBuffer = new ArrayBuffer(pdfBytes.length);
  new Uint8Array(pdfArrayBuffer).set(pdfBytes);

  return new NextResponse(pdfArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoice.id}.pdf"`,
    },
  });
}

