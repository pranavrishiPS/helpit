import { NextResponse } from "next/server";
import { syncScrumSheet } from "@/lib/scrum-sheet";
import { updateStore } from "@/lib/db";

export async function POST() {
  try {
    const result = await syncScrumSheet();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await updateStore((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        scrumSheet: {
          ...s.integrations?.scrumSheet,
          connected: s.integrations?.scrumSheet?.connected ?? false,
          lastSyncError: message,
        },
      },
    }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
