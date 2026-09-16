import { NextResponse } from "next/server";
import { deleteGmailTokens } from "@/lib/gmail-store";
import { updateStore } from "@/lib/db";

export async function POST() {
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
