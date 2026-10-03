import { NextRequest, NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/errors";
import { connectScrumSheet } from "@/lib/scrum-sheet";
import { connectScrumSheetSchema, parseBody } from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(connectScrumSheetSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await connectScrumSheet(parsed.data.url);
    return NextResponse.json(result);
  } catch (err) {
    const message = publicErrorMessage(err, "Failed to connect spreadsheet — check the server logs", "Scrum sheet connect");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
