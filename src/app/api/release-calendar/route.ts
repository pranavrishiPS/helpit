import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { readReleaseCalendarSnapshot } from "@/lib/release-calendar-store";
import { isReleaseCalendarConnected } from "@/lib/release-calendar-sync";
import { getReleaseCalendarSharePath } from "@/lib/release-calendar-share";
import { isScrumSheetConfigured } from "@/lib/scrum-sheet";

/** Snapshot + connection status for the owner page and Home. Session-protected by middleware. */
export async function GET() {
  try {
    const [snapshot, status] = await Promise.all([
      readReleaseCalendarSnapshot(),
      isReleaseCalendarConnected(),
    ]);
    return NextResponse.json(
      {
        snapshot,
        configured: isScrumSheetConfigured(),
        connected: status.connected,
        sharePath: getReleaseCalendarSharePath(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = publicErrorMessage(err, "Couldn't load the release calendar — check the server logs", "Release calendar GET");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
