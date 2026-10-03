import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTodayTasks, getUpcomingTasks } from "@/lib/utils";
import type { Task } from "@/lib/types";

function task(id: string, dueDate?: string, status: Task["status"] = "todo"): Task {
  return {
    id,
    title: id,
    status,
    priority: "medium",
    tags: [],
    source: "manual",
    dueDate,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("getTodayTasks / getUpcomingTasks use the local calendar date", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Asia/Kolkata";
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-03 20:00 UTC = 2026-10-04 01:30 IST: "tomorrow" in UTC, "today" in IST.
    vi.setSystemTime(new Date("2026-10-03T20:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const tasks = [
    task("overdue", "2026-10-03"),
    task("today", "2026-10-04"),
    task("tomorrow", "2026-10-05"),
    task("done-today", "2026-10-04", "done"),
    task("no-date"),
  ];

  it("treats the IST date as today even when UTC is still the previous day", () => {
    expect(getTodayTasks(tasks).map((t) => t.id)).toEqual(["overdue", "today"]);
  });

  it("only lists tasks after the local today as upcoming", () => {
    expect(getUpcomingTasks(tasks).map((t) => t.id)).toEqual(["tomorrow"]);
  });
});
