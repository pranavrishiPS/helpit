import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import type { Outing, OutingAttendee } from "@/lib/types";
import {
  createOutingSchema,
  updateOutingSchema,
  parseBody,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";
import { patchPerPersonInput, resolveOutingBudget } from "@/lib/outing-budget";

function normalizeAttendees(attendees: OutingAttendee[]): OutingAttendee[] {
  const seen = new Set<string>();
  return attendees
    .map((a) => ({ name: a.name.trim(), confirmed: a.confirmed }))
    .filter((a) => {
      const key = a.name.toLowerCase();
      if (!a.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mergeAttendees(
  roster: string[],
  existing: OutingAttendee[]
): OutingAttendee[] {
  const existingByName = new Map(
    existing.map((a) => [a.name.toLowerCase(), a])
  );

  return roster.map((name) => {
    const trimmed = name.trim();
    const match = existingByName.get(trimmed.toLowerCase());
    return match ?? { name: trimmed, confirmed: true };
  });
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(createOutingSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { title, destination, date, budget, budgetPerPerson, members, notes } = parsed.data;
  const attendees = normalizeAttendees(
    parsed.data.attendees ?? (members ?? []).map((name) => ({ name, confirmed: true }))
  );
  const now = new Date().toISOString();

  const resolved = resolveOutingBudget(budget, budgetPerPerson, attendees.length);
  if (!resolved) {
    return NextResponse.json({ error: "Could not determine outing budget" }, { status: 400 });
  }

  const outing: Outing = {
    id: `out-${uuidv4()}`,
    title: title.trim(),
    destination: destination?.trim() || undefined,
    date,
    budget: resolved.totalBudget,
    budgetPerPerson: resolved.perPerson,
    expenses: [],
    attendees,
    notes: notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => ({
    ...s,
    outings: [outing, ...s.outings],
  }));

  return NextResponse.json(outing, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(updateOutingSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, title, destination, date, budget, budgetPerPerson, members, notes } =
    parsed.data;
  let found = false;

  try {
    await updateStore((s) => {
      found = false; // reset: the updater re-runs on optimistic retries
      return {
        ...s,
        outings: s.outings.map((outing) => {
          if (outing.id !== id) return outing;
          found = true;

          const attendees = parsed.data.attendees
            ? normalizeAttendees(parsed.data.attendees)
            : members != null
              ? mergeAttendees(members, outing.attendees)
              : outing.attendees;
          // Explicit total without per-person: the total wins (per-person is cleared)
          const perPersonInput = patchPerPersonInput(budget, budgetPerPerson, outing.budgetPerPerson);
          const poolInputsChanged =
            parsed.data.attendees != null ||
            members != null ||
            budgetPerPerson !== undefined ||
            budget != null;

          // Only recalculate the pool when the team or budget was edited
          const resolved = poolInputsChanged
            ? resolveOutingBudget(budget ?? outing.budget, perPersonInput, attendees.length)
            : { totalBudget: outing.budget, perPerson: outing.budgetPerPerson };
          if (!resolved) {
            throw new Error("INVALID_BUDGET");
          }

          return {
            ...outing,
            title: title?.trim() ?? outing.title,
            destination:
              destination === null ? undefined : destination?.trim() ?? outing.destination,
            date: date === null ? undefined : date ?? outing.date,
            budget: resolved.totalBudget,
            budgetPerPerson: resolved.perPerson,
            attendees,
            notes: notes === null ? undefined : notes?.trim() ?? outing.notes,
            updatedAt: new Date().toISOString(),
          };
        }),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_BUDGET") {
      return NextResponse.json({ error: "Could not determine outing budget" }, { status: 400 });
    }
    throw err;
  }

  if (!found) {
    return NextResponse.json({ error: "Outing not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
