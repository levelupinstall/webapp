import { readFile } from "fs/promises";
import { join } from "path";

/**
 * Verification emails embed the logo from disk (CID attachment). Add your asset at:
 *   public/level-up-install-logo.jpg   (or .png / .jpeg / .webp)
 * then commit and redeploy. Same path is used by the site header in app/page.tsx.
 * Override with env PORTAL_EMAIL_LOGO_PATH if the file lives elsewhere on the server.
 */

/** Must match `Content-ID` / `cid:` in verification email HTML (letters, numbers, underscore). */
export const PORTAL_EMAIL_LOGO_CID = "levelup_logo";

const FILENAMES = [
  "level-up-install-logo.png",
  "level-up-install-logo.jpg",
  "level-up-install-logo.jpeg",
  "level-up-install-logo.webp",
];

function sniffImageContentType(buffer: Buffer): string {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  const sig = buffer.subarray(0, 6).toString("ascii");
  if (sig === "GIF87a" || sig === "GIF89a") {
    return "image/gif";
  }
  return "image/png";
}

/**
 * Loads logo bytes from disk for CID embedding in transactional email (no hotlinking).
 * Override path with PORTAL_EMAIL_LOGO_PATH (absolute or relative to process.cwd()).
 */
export async function loadPortalEmailLogo(): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  const override = process.env.PORTAL_EMAIL_LOGO_PATH?.trim();
  const paths = override
    ? [override.startsWith("/") ? override : join(process.cwd(), override)]
    : FILENAMES.map((name) => join(process.cwd(), "public", name));

  for (const filePath of paths) {
    try {
      const buffer = await readFile(filePath);
      if (buffer.length < 24) continue;
      return { buffer, contentType: sniffImageContentType(buffer) };
    } catch {
      continue;
    }
  }
  return null;
}
