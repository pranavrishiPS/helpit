import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import { generateAll } from "@/lib/recurrence";
import { generateRecurringSchema, parseBody } from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

/**
 * Creates today's and tomorrow's rows for every active rule. `today` is the client's local date;
 * the server (UTC on Vercel) is never trusted for it. Idempotent: repeat calls create nothing.
 */
export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(generateRecurringSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  let created = 0;
  await updateStore((s) => {
    const result = generateAll(s, parsed.data.today, now);
    created = result.created; // overwritten on every optimistic retry
    return result.store;
  });

  return NextResponse.json({ created });
}
