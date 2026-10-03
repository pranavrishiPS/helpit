import { NextRequest, NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { guardMutation } from "@/lib/request";
import { syncGmailInbox } from "@/lib/gmail";
import { updateStore } from "@/lib/db";

export async function POST(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  try {
    const result = await syncGmailInbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = publicErrorMessage(err, "Gmail sync failed — check the server logs", "Gmail sync");
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        gmail: {
          connected: s.integrations?.gmail?.connected ?? false,
          email: s.integrations?.gmail?.email,
          lastSyncedAt: s.integrations?.gmail?.lastSyncedAt,
          lastSyncError: message,
        },
      },
    }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
