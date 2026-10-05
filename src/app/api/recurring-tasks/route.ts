import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readStore, updateStore } from "@/lib/db";
import {
  applyRuleEdit,
  createRule,
  deleteRule,
  type RecurringRulePatch,
  type RuleChangeResult,
} from "@/lib/recurrence";
import {
  createRecurringTaskSchema,
  deleteRecurringTaskSchema,
  parseBody,
  updateRecurringTaskSchema,
} from "@/lib/validation";
import { guardMutation, isErrorResponse, parseJsonBody } from "@/lib/request";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.recurringTasks ?? []);
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(createRecurringTaskSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { today, ...fields } = parsed.data;
  const id = uuidv4();
  const now = new Date().toISOString();
  let result = { status: "not_found" } as RuleChangeResult;

  // Pure updater: on a Blob retry it re-runs against the fresh store.
  await updateStore((s) => {
    result = createRule(s, fields, today, now, id);
    return result.status === "ok" ? result.store : s;
  });

  if (result.status === "invalid") {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (result.status !== "ok") {
    return NextResponse.json({ error: "Could not create the rule" }, { status: 500 });
  }
  return NextResponse.json({ rule: result.rule, created: result.created }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(updateRecurringTaskSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, today, ...patch } = parsed.data;
  const now = new Date().toISOString();
  let result = { status: "not_found" } as RuleChangeResult;

  await updateStore((s) => {
    result = applyRuleEdit(s, id, patch as RecurringRulePatch, today, now);
    return result.status === "ok" ? result.store : s;
  });

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Recurring task not found" }, { status: 404 });
  }
  if (result.status === "invalid") {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ rule: result.rule, created: result.created });
}

export async function DELETE(request: NextRequest) {
  const guard = guardMutation(request);
  if (guard) return guard;
  const { searchParams } = new URL(request.url);

  const parsed = parseBody(deleteRecurringTaskSchema, {
    id: searchParams.get("id"),
    today: searchParams.get("today"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    const result = deleteRule(s, parsed.data.id, parsed.data.today);
    if (result.status !== "ok") return s;
    found = true;
    return result.store;
  });

  if (!found) {
    return NextResponse.json({ error: "Recurring task not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
