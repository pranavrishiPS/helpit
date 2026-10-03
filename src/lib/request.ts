import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export interface MutationRequestInfo {
  method: string;
  headers: Pick<Headers, "get">;
  /** True when the request carries a body. */
  hasBody: boolean;
  /** Host (with port) from the request URL. */
  urlHost?: string;
  /** Canonical app URL (NEXT_PUBLIC_APP_URL / Vercel URL / localhost). */
  appUrl?: string;
}

export interface MutationCheckFailure {
  status: 403 | 415;
  error: string;
}

function hostOf(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * CSRF guard for mutating API requests. Browsers send a cross-site `text/plain` POST
 * without a CORS preflight, so JSON-only parsing isn't enough on no-auth deployments:
 *  - a body must be declared as application/json (forces a preflight for cross-site callers);
 *  - if the browser says where the request came from (Sec-Fetch-Site / Origin) it must be
 *    this app. Callers that send neither header (curl, scripts) pass through.
 * Returns null when the request is fine.
 */
export function checkMutationRequest(info: MutationRequestInfo): MutationCheckFailure | null {
  if (!MUTATING_METHODS.has(info.method.toUpperCase())) return null;

  if (info.hasBody) {
    const contentType = (info.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json" && !contentType.endsWith("+json")) {
      return { status: 415, error: "Content-Type must be application/json" };
    }
  }

  const fetchSite = info.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && !ALLOWED_FETCH_SITES.has(fetchSite)) {
    return { status: 403, error: "Cross-site requests are not allowed" };
  }

  const origin = info.headers.get("origin");
  if (origin !== null && origin !== undefined) {
    const originHost = hostOf(origin); // "null" (opaque origin) and junk parse to undefined
    const allowed = new Set<string>();
    for (const candidate of [
      info.headers.get("host")?.toLowerCase(),
      info.headers.get("x-forwarded-host")?.split(",")[0].trim().toLowerCase(),
      info.urlHost?.toLowerCase(),
      hostOf(info.appUrl),
    ]) {
      if (candidate) allowed.add(candidate);
    }
    if (!originHost || !allowed.has(originHost)) {
      return { status: 403, error: "Cross-origin requests are not allowed" };
    }
  }

  return null;
}

/**
 * Whether the request declares a body. `request.body` is a (possibly empty) stream for any
 * POST/DELETE in Next, so it can't tell a body-less request apart; the headers can.
 */
export function requestHasBody(headers: Headers): boolean {
  const length = Number(headers.get("content-length") ?? "0");
  return (Number.isFinite(length) && length > 0) || headers.has("transfer-encoding");
}

/** Runs checkMutationRequest against a NextRequest; returns a ready error response or null. */
export function guardMutation(request: NextRequest): NextResponse | null {
  const failure = checkMutationRequest({
    method: request.method,
    headers: request.headers,
    hasBody: requestHasBody(request.headers),
    urlHost: request.nextUrl.host,
    appUrl: getAppUrl(),
  });
  return failure ? NextResponse.json({ error: failure.error }, { status: failure.status }) : null;
}

export async function parseJsonBody(request: NextRequest): Promise<unknown | NextResponse> {
  // parseJsonBody always reads a body, so a missing content-type is rejected too.
  const failure = checkMutationRequest({
    method: request.method,
    headers: request.headers,
    hasBody: true,
    urlHost: request.nextUrl.host,
    appUrl: getAppUrl(),
  });
  if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

  try {
    return await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
