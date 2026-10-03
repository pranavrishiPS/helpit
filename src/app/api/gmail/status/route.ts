import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { getGmailStatus } from "@/lib/gmail";

export async function GET() {
  try {
    const status = await getGmailStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = publicErrorMessage(err, "Status check failed — check the server logs", "Gmail status");
    return NextResponse.json(
      { configured: false, connected: false, lastSyncError: message },
      { status: 200 }
    );
  }
}
