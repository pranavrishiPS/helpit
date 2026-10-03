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

export function validateApiKey(request: NextRequest): NextResponse | null {
  if (!isApiAuthEnabled()) return null;
  if (isApiKeyExemptPath(request.nextUrl.pathname)) return null;

  const expected = process.env.HELPIT_API_KEY!.trim();
  const provided = getApiKeyFromRequest(request);

  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function getClientApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return process.env.NEXT_PUBLIC_HELPIT_API_KEY?.trim() || undefined;
}

export function apiAuthHeaders(): HeadersInit {
  const key = getClientApiKey();
  if (!key) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    [API_KEY_HEADER]: key,
  };
}
