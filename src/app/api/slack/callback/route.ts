import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { exchangeSlackCode } from "@/lib/slack";
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
    return NextResponse.redirect(`${base}/settings?slack=error`);
  }

  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(`${base}/settings?slack=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${base}/settings?slack=missing_code`);
  }

  try {
    const tokens = await exchangeSlackCode(code);
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        slack: {
          connected: true,
          userId: tokens.userId,
          teamName: tokens.teamName,
        },
      },
    }));
    return NextResponse.redirect(`${base}/settings?slack=connected`);
  } catch (err) {
    const message = publicErrorMessage(err, "Slack connection failed — check the server logs", "Slack OAuth callback");
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        slack: {
          connected: false,
          lastSyncError: message,
        },
      },
    }));
    return NextResponse.redirect(`${base}/settings?slack=error`);
  }
}
