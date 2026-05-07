import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const facebook = Boolean(
    process.env.META_PAGE_ID?.trim() && process.env.META_PAGE_ACCESS_TOKEN?.trim(),
  );
  const siteUrl = process.env.PUBLIC_SITE_URL?.trim() || "";
  const brandName = process.env.SOCIAL_BRAND_NAME?.trim() || "Our crew";

  return NextResponse.json({
    facebook,
    siteUrl: siteUrl || undefined,
    brandName,
  });
}
