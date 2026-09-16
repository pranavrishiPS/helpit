import { NextResponse } from "next/server";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";
import { getGmailAuthUrl, isGmailConfigured } from "@/lib/gmail";

export async function GET() {
  if (!isGmailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Gmail not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local",
      },
      { status: 503 }
    );
  }

  const state = createOAuthState();
  await setOAuthStateCookie(state);
  return NextResponse.redirect(getGmailAuthUrl(state));
}
