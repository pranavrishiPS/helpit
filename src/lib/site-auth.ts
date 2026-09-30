// Uses the Web Crypto API (globalThis.crypto), not Node's `crypto` module —
// this file is imported by middleware.ts, which runs in the Edge Runtime and
// does not support Node built-ins.

export const SITE_AUTH_COOKIE_NAME = "helpit_session";
export const SITE_AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padding));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(value: string): Promise<string> {
  const key = await getKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(email: string): Promise<string> {
  const expiresAt = Date.now() + SITE_AUTH_MAX_AGE_SECONDS * 1000;
  const payload = `${email}|${expiresAt}`;
  const payloadB64 = bytesToBase64Url(encoder.encode(payload));
  return `${payloadB64}.${await sign(payload)}`;
}

/** Returns the authenticated email if the token is valid, unexpired, and still allow-listed. */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const payload = decoder.decode(base64UrlToBytes(payloadB64));
  const key = await getKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signature).buffer as ArrayBuffer,
    encoder.encode(payload)
  );
  if (!valid) return null;

  const [email, expiresAtRaw] = payload.split("|");
  const expiresAt = Number(expiresAtRaw);
  if (!email || !expiresAt || Date.now() > expiresAt) return null;
  if (!isEmailAllowed(email)) return null;

  return email;
}
