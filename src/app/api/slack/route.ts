import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import { parseBody, updateSlackItemSchema } from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;  const parsed = parseBody(updateSlackItemSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, completed } = parsed.data;
  let found = false;

  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    return {
      ...s,
      slackItems: s.slackItems.map((item) => {
        if (item.id !== id) return item;
        found = true;
        return { ...item, completed };
      }),
    };
  });

  if (!found) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
