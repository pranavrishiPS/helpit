import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import type { ScrumAttendanceEntry } from "@/lib/types";
import { isStatusAllowedOnDate } from "@/lib/scrum-attendance";
import {
  deleteScrumAttendanceEntrySchema,
  parseBody,
  updateScrumAttendanceEntrySchema,
  upsertScrumAttendanceSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody, guardMutation } from "@/lib/request";

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

  let isHoliday = false;
  let unknownMembers: string[] = [];
  const updated = await updateStore((s) => {
    // reset: the updater re-runs on optimistic retries
    isHoliday = false;
    unknownMembers = [];
    if ((s.scrumHolidays ?? []).some((h) => h.date === date)) {
      isHoliday = true;
      return s;
    }
    // Only roster members can be logged; match case-insensitively and store the roster's spelling.
    const roster = new Map((s.scrumMembers ?? []).map((m) => [m.trim().toLowerCase(), m]));
    unknownMembers = entries
      .filter(({ member }) => !roster.has(member.trim().toLowerCase()))
      .map(({ member }) => member.trim());
    if (unknownMembers.length > 0) return s;
    const existing = s.scrumAttendance ?? [];
    const byMember = new Map(
      existing.filter((e) => e.date === date).map((e) => [e.member, e])
    );

    const upserted: ScrumAttendanceEntry[] = entries.map(({ member: rawMember, status, note }) => {
      const member = roster.get(rawMember.trim().toLowerCase())!;
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

  if (unknownMembers.length > 0) {
    return NextResponse.json(
      {
        error: `Not on the scrum roster: ${unknownMembers.join(", ")}. Add them to the roster first.`,
      },
      { status: 400 }
    );
  }

  if (isHoliday) {
    return NextResponse.json(
      { error: "That date is marked as a holiday — no attendance can be logged." },
      { status: 409 }
    );
  }

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
  let notAllowed = false;

  await updateStore((s) => {
    // reset: the updater re-runs on optimistic retries
    found = false;
    notAllowed = false;
    return {
      ...s,
      scrumAttendance: (s.scrumAttendance ?? []).map((entry) => {
        if (entry.id !== id) return entry;
        found = true;
        if (!isStatusAllowedOnDate(status, entry.date)) {
          notAllowed = true;
          return entry;
        }
        return {
          ...entry,
          status,
          note: note === null ? undefined : note?.trim() || entry.note,
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });

  if (!found) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (notAllowed) {
    return NextResponse.json(
      { error: "That status isn't available for this entry's date." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const guard = guardMutation(request);
  if (guard) return guard;
  const id = request.nextUrl.searchParams.get("id");
  const parsed = parseBody(deleteScrumAttendanceEntrySchema, { id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
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
