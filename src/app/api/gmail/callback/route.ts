import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { updateStore } from "@/lib/db";
import { consumeOAuthState } from "@/lib/oauth-state";
import { publicErrorMessage } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const base = getAppUrl();

  if (error) {
    return NextResponse.redirect(`${base}/settings?gmail=error`);
  }

  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(`${base}/settings?gmail=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${base}/settings?gmail=missing_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        gmail: {
          connected: true,
          email: tokens.email,
        },
      },
    }));
    return NextResponse.redirect(`${base}/settings?gmail=connected`);
  } catch (err) {
    const message = publicErrorMessage(err, "Gmail connection failed — check the server logs", "Gmail OAuth callback");
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        gmail: {
          connected: false,
          lastSyncError: message,
        },
      },
    }));
    return NextResponse.redirect(`${base}/settings?gmail=error`);
  }
}
