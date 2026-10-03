import { NextRequest, NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { guardMutation } from "@/lib/request";
import { syncSlackFollowups, isSlackRateLimitError } from "@/lib/slack";
import { updateStore } from "@/lib/db";

export async function POST(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  try {
    const result = await syncSlackFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const rateLimited = isSlackRateLimitError(err);
    const message = rateLimited
      ? "Slack rate limit reached. Sync will retry in 10 minutes."
      : publicErrorMessage(err, "Slack sync failed — check the server logs", "Slack sync");

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
