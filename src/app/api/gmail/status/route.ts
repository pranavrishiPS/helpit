import { NextResponse } from "next/server";
import { getGmailStatus } from "@/lib/gmail";

export async function GET() {
  try {
    const status = await getGmailStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status check failed";
    return NextResponse.json(
      { configured: false, connected: false, lastSyncError: message },
      { status: 200 }
    );
  }
}
