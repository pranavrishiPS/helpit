import { NextRequest, NextResponse } from "next/server";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";
import { setSheetReturnCookie } from "@/lib/sheet-oauth-return";
import { getScrumSheetAuthUrl, isScrumSheetConfigured } from "@/lib/scrum-sheet";

export async function GET(request: NextRequest) {
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
  // Release Calendar reuses this connection and wants to come back to its own page.
  await setSheetReturnCookie(request.nextUrl.searchParams.get("return"));
  return NextResponse.redirect(getScrumSheetAuthUrl(state));
}
