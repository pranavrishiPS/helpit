import { NextRequest, NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { guardMutation } from "@/lib/request";
import { syncScrumSheet } from "@/lib/scrum-sheet";
import { updateStore } from "@/lib/db";

export async function POST(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  try {
    const result = await syncScrumSheet();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = publicErrorMessage(err, "Sheet sync failed — check the server logs", "Scrum sheet sync");
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
