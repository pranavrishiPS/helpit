import { NextResponse } from "next/server";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";
import { getSlackAuthUrl, isSlackConfigured } from "@/lib/slack";

export async function GET() {
  if (!isSlackConfigured()) {
    return NextResponse.json(
      {
        error:
          "Slack not configured. Add SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to .env.local (or SLACK_USER_TOKEN)",
      },
      { status: 503 }
    );
  }

  const state = createOAuthState();
  await setOAuthStateCookie(state);
  return NextResponse.redirect(getSlackAuthUrl(state));
}
