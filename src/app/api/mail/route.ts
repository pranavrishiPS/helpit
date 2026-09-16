import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import { parseBody, updateMailItemSchema } from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;  const parsed = parseBody(updateMailItemSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, status } = parsed.data;
  let found = false;

  await updateStore((s) => ({
    ...s,
    mailItems: s.mailItems.map((item) => {
      if (item.id !== id) return item;
      found = true;
      return { ...item, status };
    }),
  }));

  if (!found) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
