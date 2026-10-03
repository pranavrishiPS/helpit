import { describe, expect, it } from "vitest";
import { applyTaskPatch } from "@/lib/task-update";
import type { Task } from "@/lib/types";

const task: Task = {
  id: "t1",
  title: "Ship build",
  status: "todo",
  priority: "medium",
  source: "manual",
  dueDate: "2026-10-10",
  reminderAt: "2026-10-09T09:00:00.000Z",
  tags: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const now = "2026-10-03T00:00:00.000Z";

describe("applyTaskPatch", () => {
  it("keeps dueDate and reminderAt when they are absent from the patch", () => {
    const result = applyTaskPatch(task, { status: "done" }, now);
    expect(result.status).toBe("done");
    expect(result.dueDate).toBe("2026-10-10");
    expect(result.reminderAt).toBe("2026-10-09T09:00:00.000Z");
    expect(result.updatedAt).toBe(now);
  });

  it("clears dueDate and reminderAt when null", () => {
    const result = applyTaskPatch(task, { dueDate: null, reminderAt: null }, now);
    expect(result.dueDate).toBeUndefined();
    expect(result.reminderAt).toBeUndefined();
  });

  it("sets dueDate and reminderAt when strings are given", () => {
    const result = applyTaskPatch(
      task,
      { dueDate: "2026-11-01", reminderAt: "2026-10-31T09:00:00.000Z" },
      now
    );
    expect(result.dueDate).toBe("2026-11-01");
    expect(result.reminderAt).toBe("2026-10-31T09:00:00.000Z");
  });

  it("clears description and owner when null, keeps them when absent", () => {
    const base: Task = { ...task, description: "details", owner: "Pranav" };
    const cleared = applyTaskPatch(base, { description: null, owner: null }, now);
    expect(cleared.description).toBeUndefined();
    expect(cleared.owner).toBeUndefined();

    const kept = applyTaskPatch(base, { status: "done" }, now);
    expect(kept.description).toBe("details");
    expect(kept.owner).toBe("Pranav");

    const set = applyTaskPatch(base, { description: "new", owner: "Sam" }, now);
    expect(set.description).toBe("new");
    expect(set.owner).toBe("Sam");
  });
});
