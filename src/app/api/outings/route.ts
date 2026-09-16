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

function resolveOutingBudget(
  budget: number | undefined,
  budgetPerPerson: number | undefined | null,
  rosterSize: number
): { totalBudget: number; perPerson?: number } | null {
  let totalBudget = budget;
  let perPerson = budgetPerPerson ?? undefined;

  if (perPerson != null && rosterSize > 0) {
    if (totalBudget == null) {
      totalBudget = Math.round(perPerson * rosterSize);
    }
  } else if (totalBudget != null && perPerson == null && rosterSize > 0) {
    perPerson = Math.round(totalBudget / rosterSize);
  }

  if (totalBudget == null) return null;
  return { totalBudget, perPerson };
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
  const roster = members ?? [];
  const now = new Date().toISOString();

  const resolved = resolveOutingBudget(budget, budgetPerPerson, roster.length);
  if (!resolved) {
    return NextResponse.json({ error: "Could not determine outing budget" }, { status: 400 });
  }

  const attendees: OutingAttendee[] = roster.map((name) => ({
    name: name.trim(),
    confirmed: true,
  }));

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
    await updateStore((s) => ({
      ...s,
      outings: s.outings.map((outing) => {
        if (outing.id !== id) return outing;
        found = true;

        const roster = members ?? outing.attendees.map((a) => a.name);
        const budgetInput = budget ?? outing.budget;
        const perPersonInput =
          budgetPerPerson === null
            ? undefined
            : budgetPerPerson ?? outing.budgetPerPerson;

        const resolved = resolveOutingBudget(budgetInput, perPersonInput, roster.length);
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
          attendees: members != null ? mergeAttendees(roster, outing.attendees) : outing.attendees,
          notes: notes === null ? undefined : notes?.trim() ?? outing.notes,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
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
