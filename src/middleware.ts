import { NextRequest, NextResponse } from "next/server";
import {
  getAuthConfigError,
  isApiAuthEnabled,
  isProductionRuntime,
  isSharePublicPath,
  isSiteAuthPublicPath,
  validateApiKey,
} from "@/lib/auth";
import {
  SITE_AUTH_COOKIE_NAME,
  isSiteAuthEnabled,
  isSiteAuthMisconfigured,
  verifySessionToken,
} from "@/lib/site-auth";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");

  // Fail closed: never serve production without a configured gate.
  const configError = getAuthConfigError({
    production: isProductionRuntime(),
    siteAuthEnabled: isSiteAuthEnabled(),
    siteAuthMisconfigured: isSiteAuthMisconfigured(),
    apiKeyEnabled: isApiAuthEnabled(),
  });
  if (configError) {
    return isApi
      ? NextResponse.json({ error: configError }, { status: 503 })
      : new NextResponse(configError, {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
  }

  // Release Calendar share link: no session or API key; the token is checked by the page/handler.
  if (isSharePublicPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  let hasSession = false;
  if (isSiteAuthEnabled()) {
    if (!isSiteAuthPublicPath(pathname)) {
      const email = await verifySessionToken(request.cookies.get(SITE_AUTH_COOKIE_NAME)?.value);
      if (!email) {
        if (isApi) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/login", request.url));
      }
      hasSession = true;
    }
  }

  // A valid session satisfies the API gate; the API key is for non-browser callers only.
  if (isApi && !hasSession) {
    const authError = await validateApiKey(request);
    if (authError) return authError;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js).*)"],
};
