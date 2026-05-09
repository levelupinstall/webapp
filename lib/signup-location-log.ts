import type { Prisma } from "@prisma/client";

/**
 * Best-effort signup geography from the incoming HTTP request.
 * On Vercel: uses geo headers + forwarded IP. Locally often sparse — still logs timestamp + source.
 */
export function captureSignupLocationFromRequest(request: Request): Prisma.InputJsonValue {
  const headers = request.headers;

  const forwardedFor = headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("true-client-ip")?.trim() ||
    undefined;

  const country =
    headers.get("x-vercel-ip-country")?.trim() ||
    headers.get("cf-ipcountry")?.trim() ||
    undefined;

  const region = headers.get("x-vercel-ip-country-region")?.trim() || undefined;
  const city = headers.get("x-vercel-ip-city")?.trim() || undefined;
  const latitude = headers.get("x-vercel-ip-latitude")?.trim() || undefined;
  const longitude = headers.get("x-vercel-ip-longitude")?.trim() || undefined;

  const sources: string[] = [];
  if (country || region || city || latitude) sources.push("edge_geo");
  if (ip) sources.push("forwarded_ip");

  return {
    recordedAt: new Date().toISOString(),
    ...(ip ? { ip } : {}),
    ...(country ? { country } : {}),
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
    ...(latitude ? { latitude } : {}),
    ...(longitude ? { longitude } : {}),
    source: sources.length > 0 ? sources.join("+") : "no_geo_headers",
  };
}
