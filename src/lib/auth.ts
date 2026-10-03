import { NextRequest, NextResponse } from "next/server";

const API_KEY_HEADER = "x-helpit-api-key";

/**
 * OAuth start/callback routes are browser redirects, so they can't send the API-key
 * header. They are exempt from the API-key check only; they still require a site-auth
 * session (see SITE_AUTH_PUBLIC_PATHS).
 */
const PUBLIC_API_PATHS = [
  "/api/slack/callback",
  "/api/gmail/callback",
  "/api/slack/auth",
  "/api/gmail/auth",
  "/api/scrum-attendance/sheet/callback",
  "/api/scrum-attendance/sheet/auth",
];

/** Site sign-in routes: browser redirects that must work without a session or API key. */
const SITE_AUTH_PUBLIC_PATHS = ["/login", "/api/auth/google/login", "/api/auth/google/callback"];

export function isApiAuthEnabled(): boolean {
  return !!process.env.HELPIT_API_KEY?.trim();
}

export function getApiKeyFromRequest(request: NextRequest): string | null {
  const header = request.headers.get(API_KEY_HEADER);
  if (header) return header;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }

  return null;
}

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Only the site sign-in routes bypass the site-auth session check. */
export function isSiteAuthPublicPath(pathname: string): boolean {
  return SITE_AUTH_PUBLIC_PATHS.includes(pathname);
}

/** Paths that skip the API-key check: OAuth start/callback routes and site sign-in. */
export function isApiKeyExemptPath(pathname: string): boolean {
  return isPublicApiPath(pathname) || isSiteAuthPublicPath(pathname);
}

/** Constant-time string comparison (Edge-safe): compares SHA-256 digests byte by byte. */
export async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const ba = new Uint8Array(da);
  const bb = new Uint8Array(db);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ (bb[i] ?? 0);
  return diff === 0;
}

/**
 * Server-side API-key gate for non-browser callers (scripts, curl). The browser never
 * holds this key; it authenticates with the site-auth session cookie instead (the
 * middleware skips this check for requests with a valid session).
 */
export async function validateApiKey(request: NextRequest): Promise<NextResponse | null> {
  if (!isApiAuthEnabled()) return null;
  if (isApiKeyExemptPath(request.nextUrl.pathname)) return null;

  const expected = process.env.HELPIT_API_KEY!.trim();
  const provided = getApiKeyFromRequest(request) ?? "";

  if (!(await timingSafeEqualStrings(provided, expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export interface AuthGateState {
  /** Running on Vercel / in a production runtime (not `next build`, dev or tests). */
  production: boolean;
  siteAuthEnabled: boolean;
  /** Site-auth allow-list is set but its signing secret is missing. */
  siteAuthMisconfigured: boolean;
  apiKeyEnabled: boolean;
}

export function isProductionRuntime(env: Record<string, string | undefined> = process.env): boolean {
  // `next build` sets NODE_ENV=production but must never be blocked by the gate.
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return env.VERCEL === "1" || env.NODE_ENV === "production";
}

/**
 * Fail closed: in production, refuse to serve anything unless site auth
 * (SITE_AUTH_ALLOWED_EMAILS + SITE_AUTH_SECRET) is configured. The browser only
 * authenticates with the site-auth session, so HELPIT_API_KEY alone would lock every
 * browser call out; it stays an optional extra key for scripts.
 * Returns a message when the request must be refused, null otherwise.
 */
export function getAuthConfigError(state: AuthGateState): string | null {
  if (!state.production) return null;
  if (state.siteAuthMisconfigured) {
    return "Auth not configured: SITE_AUTH_ALLOWED_EMAILS is set but SITE_AUTH_SECRET is missing.";
  }
  if (!state.siteAuthEnabled) {
    return "Auth not configured: set SITE_AUTH_ALLOWED_EMAILS and SITE_AUTH_SECRET to serve Helpit in production (HELPIT_API_KEY alone is not enough; browsers sign in via site auth).";
  }
  return null;
}

