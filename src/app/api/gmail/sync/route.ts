import { NextResponse } from "next/server";
import { syncGmailInbox } from "@/lib/gmail";
import { updateStore } from "@/lib/db";

export async function POST() {
  try {
    const result = await syncGmailInbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
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
