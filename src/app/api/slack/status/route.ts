import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { getSlackStatus } from "@/lib/slack";

export async function GET() {
  try {
    const status = await getSlackStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = publicErrorMessage(err, "Status check failed — check the server logs", "Slack status");
    return NextResponse.json(
      { configured: false, connected: false, lastSyncError: message },
      { status: 200 }
    );
  }
}
