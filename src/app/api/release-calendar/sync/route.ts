import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation, isErrorResponse, parseJsonBody, requestHasBody } from "@/lib/request";
import { syncReleaseCalendar } from "@/lib/release-calendar-sync";

const syncBodySchema = z.object({ force: z.boolean().optional() }).strict();

/** Owner sync. `force` (Sync now) skips the 5-minute throttle but not the in-flight guard. */
export async function POST(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  let force = false;
  if (requestHasBody(request.headers)) {
    const body = await parseJsonBody(request);
    if (isErrorResponse(body)) return body;
    const parsed = syncBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sync request" }, { status: 400 });
    }
    force = parsed.data.force ?? false;
  }

  const result = await syncReleaseCalendar({ force });
  return NextResponse.json(
    {
      ok: !result.error,
      error: result.error,
      synced: result.synced,
      skipped: result.skipped,
      notConnected: result.notConnected ?? false,
      snapshot: result.snapshot,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
