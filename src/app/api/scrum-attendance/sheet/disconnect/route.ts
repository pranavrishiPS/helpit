import { NextRequest, NextResponse } from "next/server";
import { guardMutation } from "@/lib/request";
import { deleteScrumSheetTokens } from "@/lib/scrum-sheet-store";
import { updateStore } from "@/lib/db";

export async function POST(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  await deleteScrumSheetTokens();
  await updateStore((s) => ({
    ...s,
    integrations: {
      ...s.integrations,
      scrumSheet: {
        connected: false,
        email: undefined,
        spreadsheetId: undefined,
        spreadsheetUrl: undefined,
        lastSyncedAt: undefined,
        lastSyncError: undefined,
      },
    },
  }));

  return NextResponse.json({ success: true });
}
