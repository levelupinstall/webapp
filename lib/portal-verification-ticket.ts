import jwt from "jsonwebtoken";

const TICKET_TYP = "portal_signup_verify";

export type PortalSignupVerifyPayload = {
  typ: typeof TICKET_TYP;
  userId: string;
};

function authSecret() {
  return process.env.AUTH_SECRET || "dev-only-secret-change-me";
}

export function signPortalSignupVerificationTicket(userId: string): string {
  return jwt.sign({ typ: TICKET_TYP, userId }, authSecret(), { expiresIn: "24h" });
}

export function verifyPortalSignupVerificationTicket(
  token: string,
): PortalSignupVerifyPayload | null {
  try {
    const payload = jwt.verify(token, authSecret()) as PortalSignupVerifyPayload & {
      typ?: string;
    };
    if (payload.typ !== TICKET_TYP || typeof payload.userId !== "string" || !payload.userId) {
      return null;
    }
    return { typ: TICKET_TYP, userId: payload.userId };
  } catch {
    return null;
  }
}
