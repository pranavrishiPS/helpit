import { NextRequest, NextResponse } from "next/server";
import { isSiteAuthPublicPath, validateApiKey } from "@/lib/auth";
import { SITE_AUTH_COOKIE_NAME, isSiteAuthEnabled, verifySessionToken } from "@/lib/site-auth";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isSiteAuthEnabled()) {
    if (!isSiteAuthPublicPath(pathname)) {
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
