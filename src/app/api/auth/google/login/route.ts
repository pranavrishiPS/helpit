import { NextResponse } from "next/server";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";
import { getLoginAuthUrl } from "@/lib/site-auth-google";

export async function GET() {
  const state = createOAuthState();
  await setOAuthStateCookie(state);
  return NextResponse.redirect(getLoginAuthUrl(state));
}
