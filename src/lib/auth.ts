import { NextRequest, NextResponse } from "next/server";

const API_KEY_HEADER = "x-helpit-api-key";

/** OAuth callbacks must stay public so Slack/Google can redirect back. */
const PUBLIC_API_PATHS = [
  "/api/slack/callback",
  "/api/gmail/callback",
  "/api/slack/auth",
  "/api/gmail/auth",
  "/api/scrum-attendance/sheet/callback",
  "/api/scrum-attendance/sheet/auth",
];

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

export function validateApiKey(request: NextRequest): NextResponse | null {
  if (!isApiAuthEnabled()) return null;
  if (isPublicApiPath(request.nextUrl.pathname)) return null;

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
