import { createHash } from "crypto";

/** Deterministic hash for storing password-reset tokens (plaintext only in email link). */
export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}
