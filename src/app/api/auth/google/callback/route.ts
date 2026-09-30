import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { consumeOAuthState } from "@/lib/oauth-state";
import { exchangeLoginCode } from "@/lib/site-auth-google";
import {
  SITE_AUTH_COOKIE_NAME,
  SITE_AUTH_MAX_AGE_SECONDS,
  createSessionToken,
  isEmailAllowed,
} from "@/lib/site-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const base = getAppUrl();

  if (error) {
    return NextResponse.redirect(`${base}/login?error=denied`);
  }
  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(`${base}/login?error=invalid_state`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/login?error=missing_code`);
  }

  try {
    const email = await exchangeLoginCode(code);
    if (!isEmailAllowed(email)) {
      return NextResponse.redirect(`${base}/login?error=not_allowed`);
    }

    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(SITE_AUTH_COOKIE_NAME, await createSessionToken(email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SITE_AUTH_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.redirect(`${base}/login?error=login_failed`);
  }
}
