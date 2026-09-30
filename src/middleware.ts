import { NextRequest, NextResponse } from "next/server";
import { isPublicApiPath, validateApiKey } from "@/lib/auth";
import { SITE_AUTH_COOKIE_NAME, isSiteAuthEnabled, verifySessionToken } from "@/lib/site-auth";

/** Paths reachable without a site-auth session, beyond the existing public API callbacks. */
const PUBLIC_PATHS = ["/login", "/api/auth/google/login", "/api/auth/google/callback"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isSiteAuthEnabled()) {
    const isPublic = PUBLIC_PATHS.includes(pathname) || isPublicApiPath(pathname);

    if (!isPublic) {
      const email = await verifySessionToken(request.cookies.get(SITE_AUTH_COOKIE_NAME)?.value);
      if (!email) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/login", request.url));
      }
    }
  }

  if (pathname.startsWith("/api/")) {
    const authError = validateApiKey(request);
    if (authError) return authError;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon).*)"],
};
