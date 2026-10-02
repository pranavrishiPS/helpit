import { NextRequest, NextResponse } from "next/server";
import { updateStore } from "@/lib/db";
import {
  addScrumHolidaySchema,
  parseBody,
  removeScrumHolidaySchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(addScrumHolidaySchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { date, label } = parsed.data;

  const updated = await updateStore((s) => {
    const existing = (s.scrumHolidays ?? []).filter((h) => h.date !== date);
    return {
      ...s,
      scrumHolidays: [...existing, { date, label: label?.trim() || undefined }],
      // A holiday has no attendance, so anything already logged for that date is removed.
      scrumAttendance: (s.scrumAttendance ?? []).filter((e) => e.date !== date),
    };
  });

  return NextResponse.json(updated.scrumHolidays, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const parsed = parseBody(removeScrumHolidaySchema, { date });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await updateStore((s) => ({
    ...s,
    scrumHolidays: (s.scrumHolidays ?? []).filter((h) => h.date !== parsed.data.date),
  }));

  return NextResponse.json({ success: true });
}
