import { NextResponse } from "next/server";
import { syncSlackFollowups, isSlackRateLimitError } from "@/lib/slack";
import { updateStore } from "@/lib/db";

export async function POST() {
  try {
    const result = await syncSlackFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const rateLimited = isSlackRateLimitError(err);
    const message =
      err instanceof Error
        ? err.message
        : rateLimited
          ? "Slack rate limit reached. Sync will retry in 10 minutes."
          : "Sync failed";

    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        slack: {
          connected: s.integrations?.slack?.connected ?? false,
          userId: s.integrations?.slack?.userId,
          teamName: s.integrations?.slack?.teamName,
          lastSyncedAt: s.integrations?.slack?.lastSyncedAt,
          lastSyncError: message,
        },
      },
    }));

    return NextResponse.json(
      { error: message, rateLimited },
      { status: rateLimited ? 429 : 500 }
    );
  }
}
