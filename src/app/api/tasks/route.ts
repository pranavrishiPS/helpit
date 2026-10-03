import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readStore, updateStore } from "@/lib/db";
import type { Task } from "@/lib/types";
import { applyTaskPatch } from "@/lib/task-update";
import {
  createTaskSchema,
  deleteTaskSchema,
  parseBody,
  updateTaskSchema,
} from "@/lib/validation";
import { isErrorResponse, parseJsonBody } from "@/lib/request";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.tasks);
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(createTaskSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const data = parsed.data;

  const task: Task = {
    id: uuidv4(),
    title: data.title,
    description: data.description,
    status: data.status ?? "todo",
    priority: data.priority ?? "medium",
    source: data.source ?? "manual",
    dueDate: data.dueDate,
    reminderAt: data.reminderAt,
    tags: data.tags ?? [],
    owner: data.owner,
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => ({
    ...s,
    tasks: [...s.tasks, task],
  }));

  return NextResponse.json(task, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (isErrorResponse(body)) return body;

  const parsed = parseBody(updateTaskSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  let updated: Task | undefined;

  await updateStore((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== id) return t;
      updated = applyTaskPatch(t, updates, new Date().toISOString());
      return updated;
    }),
  }));

  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const parsed = parseBody(deleteTaskSchema, { id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let found = false;
  await updateStore((s) => {
    found = false; // reset: the updater re-runs on optimistic retries
    const exists = s.tasks.some((t) => t.id === parsed.data.id);
    if (!exists) return s;
    found = true;
    return { ...s, tasks: s.tasks.filter((t) => t.id !== parsed.data.id) };
  });

  if (!found) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
