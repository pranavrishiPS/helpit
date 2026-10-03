import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { getScrumSheetStatus } from "@/lib/scrum-sheet";

export async function GET() {
  try {
    const status = await getScrumSheetStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = publicErrorMessage(err, "Status check failed — check the server logs", "Scrum sheet status");
    return NextResponse.json(
      { configured: false, connected: false, lastSyncError: message },
      { status: 200 }
    );
  }
}
