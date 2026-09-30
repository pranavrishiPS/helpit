import { createHmac, timingSafeEqual } from "crypto";

export const SITE_AUTH_COOKIE_NAME = "helpit_session";
export const SITE_AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecret(): string {
  return (process.env.SITE_AUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

function getAllowedEmails(): string[] {
  return (process.env.SITE_AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSiteAuthEnabled(): boolean {
  return getAllowedEmails().length > 0 && !!getSecret();
}

export function isEmailAllowed(email: string): boolean {
  return getAllowedEmails().includes(email.trim().toLowerCase());
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createSessionToken(email: string): string {
  const expiresAt = Date.now() + SITE_AUTH_MAX_AGE_SECONDS * 1000;
  const payload = `${email}|${expiresAt}`;
  const payloadB64 = Buffer.from(payload).toString("base64url");
  return `${payloadB64}.${sign(payload)}`;
}

/** Returns the authenticated email if the token is valid, unexpired, and still allow-listed. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
  const expected = sign(payload);

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const [email, expiresAtRaw] = payload.split("|");
  const expiresAt = Number(expiresAtRaw);
  if (!email || !expiresAt || Date.now() > expiresAt) return null;
  if (!isEmailAllowed(email)) return null;

  return email;
}
