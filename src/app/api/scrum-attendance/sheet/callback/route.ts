import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { exchangeCodeForTokens } from "@/lib/scrum-sheet";
import { updateStore } from "@/lib/db";
import { consumeOAuthState } from "@/lib/oauth-state";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const base = getAppUrl();

  if (error) {
    return NextResponse.redirect(`${base}/scrum?sheet=error`);
  }

  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(`${base}/scrum?sheet=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${base}/scrum?sheet=missing_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        scrumSheet: {
          ...s.integrations?.scrumSheet,
          connected: true,
          email: tokens.email,
        },
      },
    }));
    return NextResponse.redirect(`${base}/scrum?sheet=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        scrumSheet: {
          ...s.integrations?.scrumSheet,
          connected: false,
          lastSyncError: message,
        },
      },
    }));
    return NextResponse.redirect(`${base}/scrum?sheet=error`);
  }
}
