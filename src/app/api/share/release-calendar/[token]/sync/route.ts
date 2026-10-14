import { NextRequest, NextResponse } from "next/server";
import { guardMutation } from "@/lib/request";
import { isValidReleaseCalendarShareToken } from "@/lib/release-calendar-share";
import { syncReleaseCalendar } from "@/lib/release-calendar-sync";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * Public share-link refresh (no session). Always throttled, never forced. Returns only the
 * calendar data: no email, no error detail, no connection flag.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!(await isValidReleaseCalendarShareToken(token))) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  try {
    const result = await syncReleaseCalendar({ force: false });
    const snapshot = result.snapshot;
    return NextResponse.json(
      {
        weeks: snapshot?.weeks ?? [],
        syncedAt: snapshot?.syncedAt,
        warnings: snapshot?.warnings ?? [],
        // A disconnected owner is not a refresh failure for viewers (spec §8).
        ...(result.error && !result.notConnected ? { error: "Couldn't refresh." } : {}),
      },
      { headers: NO_STORE }
    );
  } catch {
    return NextResponse.json({ error: "Couldn't refresh." }, { status: 500, headers: NO_STORE });
  }
}
