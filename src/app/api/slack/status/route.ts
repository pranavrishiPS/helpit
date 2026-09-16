import { NextResponse } from "next/server";
import { getSlackStatus } from "@/lib/slack";

export async function GET() {
  try {
    const status = await getSlackStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status check failed";
    return NextResponse.json(
      { configured: false, connected: false, lastSyncError: message },
      { status: 200 }
    );
  }
}
