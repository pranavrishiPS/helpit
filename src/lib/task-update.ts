import type { Task } from "@/lib/types";

type TaskPatch = Partial<
  Omit<Task, "id" | "dueDate" | "reminderAt" | "description" | "owner">
> & {
  description?: string | null;
  owner?: string | null;
  dueDate?: string | null;
  reminderAt?: string | null;
};

/**
 * Merge a PATCH body into a task. `dueDate` / `reminderAt` / `description` / `owner` are
 * only touched when present in the patch: `null` clears, a string sets, absent leaves untouched.
 */
export function applyTaskPatch(task: Task, patch: TaskPatch, now: string): Task {
  const { dueDate, reminderAt, description, owner, ...rest } = patch;
  const merged: Task = { ...task, ...rest, updatedAt: now };
  if (dueDate !== undefined) merged.dueDate = dueDate === null ? undefined : dueDate;
  if (reminderAt !== undefined) merged.reminderAt = reminderAt === null ? undefined : reminderAt;
  if (description !== undefined) merged.description = description === null ? undefined : description;
  if (owner !== undefined) merged.owner = owner === null ? undefined : owner;
  return merged;
}
