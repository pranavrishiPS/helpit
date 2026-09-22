import { NextResponse } from "next/server";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";
import { getScrumSheetAuthUrl, isScrumSheetConfigured } from "@/lib/scrum-sheet";

export async function GET() {
  if (!isScrumSheetConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Sheets not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local",
      },
      { status: 503 }
    );
  }

  const state = createOAuthState();
  await setOAuthStateCookie(state);
  return NextResponse.redirect(getScrumSheetAuthUrl(state));
}
