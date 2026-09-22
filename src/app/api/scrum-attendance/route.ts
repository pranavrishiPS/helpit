import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import type { ScrumAttendanceEntry } from "@/lib/types";
import {
  deleteScrumAttendanceEntrySchema,
  parseBody,
  updateScrumAttendanceEntrySchema,
  upsertScrumAttendanceSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

/** Create-or-update every member's entry for a given date in one request. */
export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(upsertScrumAttendanceSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { date, entries } = parsed.data;
  const now = new Date().toISOString();

  const updated = await updateStore((s) => {
    const existing = s.scrumAttendance ?? [];
    const byMember = new Map(
      existing.filter((e) => e.date === date).map((e) => [e.member, e])
    );

    const upserted: ScrumAttendanceEntry[] = entries.map(({ member, status, note }) => {
      const current = byMember.get(member);
      if (current) {
        return { ...current, status, note: note?.trim() || undefined, updatedAt: now };
      }
      return {
        id: uuidv4(),
        date,
        member,
        status,
        note: note?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
    });

    const upsertedMembers = new Set(upserted.map((e) => e.member));
    const untouched = existing.filter(
      (e) => !(e.date === date && upsertedMembers.has(e.member))
    );

    return { ...s, scrumAttendance: [...untouched, ...upserted] };
  });

  return NextResponse.json(
    updated.scrumAttendance.filter((e) => e.date === date),
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(updateScrumAttendanceEntrySchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, status, note } = parsed.data;
  let found = false;

  await updateStore((s) => ({
    ...s,
    scrumAttendance: (s.scrumAttendance ?? []).map((entry) => {
      if (entry.id !== id) return entry;
      found = true;
      return {
        ...entry,
        status,
        note: note === null ? undefined : note?.trim() || entry.note,
        updatedAt: new Date().toISOString(),
      };
    }),
  }));

  if (!found) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const parsed = parseBody(deleteScrumAttendanceEntrySchema, { id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    const next = (s.scrumAttendance ?? []).filter((entry) => {
      if (entry.id === parsed.data.id) {
        found = true;
        return false;
      }
      return true;
    });
    return { ...s, scrumAttendance: next };
  });

  if (!found) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
