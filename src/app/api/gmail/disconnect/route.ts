import { NextRequest, NextResponse } from "next/server";
import { guardMutation } from "@/lib/request";
import { deleteGmailTokens } from "@/lib/gmail-store";
import { updateStore } from "@/lib/db";

export async function POST(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;

  await deleteGmailTokens();
  await updateStore((s) => ({
    ...s,
    integrations: {
      ...s.integrations,
      gmail: {
        connected: false,
        email: undefined,
        lastSyncedAt: undefined,
        lastSyncError: undefined,
      },
    },
  }));

  return NextResponse.json({ success: true });
}
