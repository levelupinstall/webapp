/**
 * Public site origin (scheme + host, no trailing slash) for absolute URLs in emails and redirects.
 *
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL, SITE_URL, or APP_URL — set to https://yourdomain.com in production.
 * 2. Incoming request URL or x-forwarded-* headers — uses the hostname visitors used (e.g. custom domain).
 * 3. VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL — Vercel system env when no request context.
 * 4. http://localhost:3000 for local development.
 */

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Accepts full URL or bare hostname; returns origin with https unless http(s) already present. */
export function normalizeToOrigin(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      return stripTrailingSlashes(`${u.protocol}//${u.host}`);
    } catch {
      return null;
    }
  }
  const host = stripTrailingSlashes(t).replace(/^\/\//, "");
  if (!host || host.includes(" ") || host.includes("/")) return null;
  return `https://${host}`;
}

function explicitEnvOrigin(): string | null {
  for (const key of ["NEXT_PUBLIC_SITE_URL", "SITE_URL", "APP_URL"] as const) {
    const v = process.env[key]?.trim();
    if (v) {
      const o = normalizeToOrigin(v);
      if (o) return o;
    }
  }
  return null;
}

function vercelEnvOrigin(): string | null {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    const o = normalizeToOrigin(production);
    if (o) return o;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const o = normalizeToOrigin(vercel);
    if (o) return o;
  }

  return null;
}

function originFromRequest(request: Request): string | null {
  try {
    const parsed = new URL(request.url);
    if (parsed.hostname) {
      return stripTrailingSlashes(`${parsed.protocol}//${parsed.host}`);
    }
  } catch {
    /* ignore */
  }

  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.split(",")[0]?.trim();
  if (!host || host.includes("..")) return null;

  const protoRaw =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() ?? "";
  const proto = protoRaw === "http" || protoRaw === "https" ? protoRaw : "https";

  return `${proto}://${host}`;
}

export function resolveSiteOrigin(request?: Request): string {
  const explicit = explicitEnvOrigin();
  if (explicit) return explicit;

  if (request) {
    const fromReq = originFromRequest(request);
    if (fromReq) return fromReq;
  }

  const vercel = vercelEnvOrigin();
  if (vercel) return vercel;

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[site-origin] Verification links default to localhost — set NEXT_PUBLIC_SITE_URL (e.g. https://yourdomain.com) or ensure API requests include Host / x-forwarded-host.",
    );
  }

  return "http://localhost:3000";
}
