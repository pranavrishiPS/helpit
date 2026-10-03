import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateStore } from "@/lib/db";
import type { OutingExpense } from "@/lib/types";
import {
  createOutingExpenseSchema,
  deleteOutingExpenseSchema,
  parseBody,
  updateOutingExpenseSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody, guardMutation } from "@/lib/request";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(createOutingExpenseSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { outingId, title, amount, type, date, notes, attendeeCount } = parsed.data;
  const expense: OutingExpense = {
    id: `exp-${uuidv4()}`,
    title: title.trim(),
    amount,
    type,
    date,
    notes: notes?.trim() || undefined,
    attendeeCount,
  };

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    return {
      ...s,
      outings: s.outings.map((outing) => {
        if (outing.id !== outingId) return outing;
        found = true;
        return {
          ...outing,
          expenses: [...(outing.expenses ?? []), expense],
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });

  if (!found) {
    return NextResponse.json({ error: "Outing not found" }, { status: 404 });
  }

  return NextResponse.json(expense, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(updateOutingExpenseSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { outingId, id, title, amount, type, date, notes, attendeeCount } = parsed.data;
  let outingFound = false;
  let expenseFound = false;

  await updateStore((s) => {
    // reset: the updater re-runs on optimistic retries
    outingFound = false;
    expenseFound = false;
    return {
      ...s,
      outings: s.outings.map((outing) => {
        if (outing.id !== outingId) return outing;
        outingFound = true;
        return {
          ...outing,
          expenses: (outing.expenses ?? []).map((expense) => {
            if (expense.id !== id) return expense;
            expenseFound = true;
            return {
              ...expense,
              title: title?.trim() ?? expense.title,
              amount: amount ?? expense.amount,
              type: type ?? expense.type,
              date: date === null ? undefined : date ?? expense.date,
              notes: notes === null ? undefined : notes?.trim() ?? expense.notes,
              attendeeCount:
                attendeeCount === null ? undefined : attendeeCount ?? expense.attendeeCount,
            };
          }),
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });

  if (!outingFound) {
    return NextResponse.json({ error: "Outing not found" }, { status: 404 });
  }
  if (!expenseFound) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const guard = guardMutation(request);
  if (guard) return guard;
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;
  const parsed = parseBody(deleteOutingExpenseSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { outingId, id } = parsed.data;
  let outingFound = false;
  let expenseFound = false;

  await updateStore((s) => {
    // reset: the updater re-runs on optimistic retries
    outingFound = false;
    expenseFound = false;
    const outings = s.outings.map((outing) => {
      if (outing.id !== outingId) return outing;
      outingFound = true;
      const nextExpenses = (outing.expenses ?? []).filter((expense) => {
        if (expense.id === id) {
          expenseFound = true;
          return false;
        }
        return true;
      });
      return {
        ...outing,
        expenses: nextExpenses,
        updatedAt: new Date().toISOString(),
      };
    });
    return { ...s, outings };
  });

  if (!outingFound) {
    return NextResponse.json({ error: "Outing not found" }, { status: 404 });
  }
  if (!expenseFound) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
