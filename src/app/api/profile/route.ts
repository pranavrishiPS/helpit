import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import { parseBody, profileSchema } from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(profileSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const profile = parsed.data;
  const store = await updateStore((s) => ({ ...s, profile }));

  return NextResponse.json(store.profile);
}
