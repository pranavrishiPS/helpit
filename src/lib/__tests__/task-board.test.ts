import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  commentPatch,
  dayProgress,
  formatDayChip,
  groupTasksByDay,
  reschedulePatch,
  shiftDayKey,
  sortByCreated,
  splitRecentDays,
  statusPatch,
  tasksForDay,
  titlePatch,
  todayKey,
  type DaySection,
} from "@/lib/task-board";
import type { Task } from "@/lib/types";

function task(
  id: string,
  dueDate?: string,
  status: Task["status"] = "todo",
  extra: Partial<Task> = {}
): Task {
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
    ...extra,
  };
}

describe("task board helpers", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Asia/Kolkata";
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  describe("todayKey", () => {
    it("uses the local date, not the UTC date, at 00:30 local", () => {
      // 00:30 IST on 5 Oct is still 4 Oct in UTC.
      const now = new Date("2026-10-04T19:00:00.000Z");
      expect(now.toISOString().slice(0, 10)).toBe("2026-10-04");
      expect(todayKey(now)).toBe("2026-10-05");
    });

    it("defaults to the current time", () => {
      expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("shiftDayKey", () => {
    it("moves within a month", () => {
      expect(shiftDayKey("2026-10-05", 1)).toBe("2026-10-06");
      expect(shiftDayKey("2026-10-05", -1)).toBe("2026-10-04");
    });

    it("crosses month ends", () => {
      expect(shiftDayKey("2026-10-31", 1)).toBe("2026-11-01");
      expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    });

    it("crosses year ends", () => {
      expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
      expect(shiftDayKey("2027-01-01", -1)).toBe("2026-12-31");
    });

    it("handles leap days", () => {
      expect(shiftDayKey("2028-02-28", 1)).toBe("2028-02-29");
      expect(shiftDayKey("2028-02-29", 1)).toBe("2028-03-01");
    });

    it("is not thrown off by DST changes", () => {
      const previous = process.env.TZ;
      process.env.TZ = "America/New_York";
      try {
        expect(shiftDayKey("2026-03-08", 1)).toBe("2026-03-09");
        expect(shiftDayKey("2026-03-09", -1)).toBe("2026-03-08");
        expect(shiftDayKey("2026-11-01", 1)).toBe("2026-11-02");
        expect(shiftDayKey("2026-11-02", -1)).toBe("2026-11-01");
      } finally {
        process.env.TZ = previous;
      }
    });

    it("returns a malformed key unchanged", () => {
      expect(shiftDayKey("nope", 1)).toBe("nope");
    });
  });

  describe("formatDayChip", () => {
    it("formats ordinal day, month and two-digit year", () => {
      expect(formatDayChip("2026-10-05")).toBe("5th Oct, 26");
      expect(formatDayChip("2026-10-04")).toBe("4th Oct, 26");
      expect(formatDayChip("2026-10-01")).toBe("1st Oct, 26");
      expect(formatDayChip("2026-10-22")).toBe("22nd Oct, 26");
      expect(formatDayChip("2026-10-13")).toBe("13th Oct, 26");
    });

    it("returns a malformed key unchanged", () => {
      expect(formatDayChip("nope")).toBe("nope");
    });
  });

  describe("tasksForDay", () => {
    it("returns only tasks due that day", () => {
      const tasks = [task("a", "2026-10-05"), task("b", "2026-10-06"), task("c")];
      expect(tasksForDay(tasks, "2026-10-05").map((t) => t.id)).toEqual(["a"]);
    });

    it("compares the date part only", () => {
      const tasks = [task("a", "2026-10-05T09:00:00.000Z")];
      expect(tasksForDay(tasks, "2026-10-05")).toHaveLength(1);
    });

    it("ignores malformed dates", () => {
      expect(tasksForDay([task("a", "soon")], "2026-10-05")).toEqual([]);
    });
  });

  describe("sortByCreated", () => {
    it("orders oldest first without mutating the input", () => {
      const tasks = [
        task("b", undefined, "todo", { createdAt: "2026-02-01T00:00:00.000Z" }),
        task("a", undefined, "todo", { createdAt: "2026-01-01T00:00:00.000Z" }),
      ];
      expect(sortByCreated(tasks).map((t) => t.id)).toEqual(["a", "b"]);
      expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
    });
  });

  describe("groupTasksByDay", () => {
    const today = "2026-10-05";

    it("always returns a Today section, even with no tasks", () => {
      const groups = groupTasksByDay([], today);
      expect(groups.today).toEqual({ key: today, dayKey: today, tasks: [] });
      expect(groups.past).toEqual([]);
      expect(groups.upcoming).toEqual([]);
      expect(groups.noDate.tasks).toEqual([]);
    });

    it("puts earlier days newest first and future days soonest first", () => {
      const tasks = [
        task("p1", "2026-10-02"),
        task("p2", "2026-10-04"),
        task("p3", "2026-09-30"),
        task("f1", "2026-10-09"),
        task("f2", "2026-10-06"),
        task("t", today),
      ];
      const groups = groupTasksByDay(tasks, today);
      expect(groups.past.map((s) => s.key)).toEqual(["2026-10-04", "2026-10-02", "2026-09-30"]);
      expect(groups.upcoming.map((s) => s.key)).toEqual(["2026-10-06", "2026-10-09"]);
      expect(groups.today.tasks.map((t) => t.id)).toEqual(["t"]);
    });

    it("groups by due date, comparing the date part only", () => {
      const groups = groupTasksByDay(
        [task("a", "2026-10-05T09:00:00.000Z"), task("b", "2026-10-05")],
        today
      );
      expect(groups.today.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    });

    it("sends missing and malformed due dates to No date", () => {
      const groups = groupTasksByDay([task("a"), task("b", ""), task("c", "garbage")], today);
      expect(groups.noDate.key).toBe("none");
      expect(groups.noDate.dayKey).toBeUndefined();
      expect(groups.noDate.tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
      expect(groups.past).toEqual([]);
    });

    it("orders each section by createdAt ascending whatever the status", () => {
      const tasks = [
        task("late", today, "todo", { createdAt: "2026-03-01T00:00:00.000Z" }),
        task("done-first", today, "done", { createdAt: "2026-01-01T00:00:00.000Z" }),
        task("mid", today, "blocked", { createdAt: "2026-02-01T00:00:00.000Z" }),
      ];
      expect(groupTasksByDay(tasks, today).today.tasks.map((t) => t.id)).toEqual([
        "done-first",
        "mid",
        "late",
      ]);
    });

    it("keeps row order when a status changes", () => {
      const a = task("a", today, "todo", { createdAt: "2026-01-01T00:00:00.000Z" });
      const b = task("b", today, "todo", { createdAt: "2026-01-02T00:00:00.000Z" });
      const after = [{ ...a, status: "done" as const }, b];
      expect(groupTasksByDay(after, today).today.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    });

    it("adds empty sections for extra days, ignoring today and malformed keys", () => {
      const groups = groupTasksByDay([task("a", "2026-10-06")], today, [
        "2026-10-08",
        "2026-10-06",
        "2026-10-01",
        today,
        "nope",
      ]);
      expect(groups.upcoming.map((s) => [s.key, s.tasks.length])).toEqual([
        ["2026-10-06", 1],
        ["2026-10-08", 0],
      ]);
      expect(groups.past.map((s) => [s.key, s.tasks.length])).toEqual([["2026-10-01", 0]]);
      expect(groups.today.key).toBe(today);
    });

    it("works across a month and year boundary", () => {
      const groups = groupTasksByDay(
        [task("a", "2026-12-31"), task("b", "2027-01-01")],
        "2027-01-01"
      );
      expect(groups.past.map((s) => s.key)).toEqual(["2026-12-31"]);
      expect(groups.today.tasks.map((t) => t.id)).toEqual(["b"]);
    });
  });

  describe("splitRecentDays", () => {
    function days(n: number, month = "09", withTasks = true): DaySection[] {
      return Array.from({ length: n }, (_, i) => {
        const key = `2026-${month}-${String(30 - i).padStart(2, "0")}`;
        return { key, dayKey: key, tasks: withTasks ? [task(`t${month}${i}`)] : [] };
      });
    }

    it("shows the 7 most recent days with tasks and puts the rest behind older", () => {
      const { recent, older } = splitRecentDays(days(10));
      expect(recent).toHaveLength(7);
      expect(older.map((s) => s.key)).toEqual(["2026-09-23", "2026-09-22", "2026-09-21"]);
    });

    it("returns everything as recent when there are 7 or fewer", () => {
      expect(splitRecentDays(days(7)).older).toEqual([]);
    });

    it("keeps empty (revealed) sections and kept days visible without using the limit", () => {
      const list = [...days(1, "10", false), ...days(10, "08")];
      const { recent, older } = splitRecentDays(list, 7, new Set(["2026-08-21"]));
      const keys = recent.map((s) => s.key);
      expect(keys).toContain("2026-10-30");
      expect(keys).toContain("2026-08-21");
      expect(recent).toHaveLength(1 + 7 + 1);
      expect(older).toHaveLength(2);
    });
  });

  describe("dayProgress", () => {
    it("counts done and total for the day only", () => {
      const tasks = [
        task("a", "2026-10-05", "done"),
        task("b", "2026-10-05", "todo"),
        task("c", "2026-10-05", "blocked"),
        task("d", "2026-10-04", "done"),
        task("e"),
      ];
      expect(dayProgress(tasks, "2026-10-05")).toEqual({ done: 1, total: 3 });
    });

    it("ignores other days", () => {
      const tasks = [task("late", "2026-10-01", "todo"), task("today", "2026-10-05", "done")];
      expect(dayProgress(tasks, "2026-10-05")).toEqual({ done: 1, total: 1 });
    });

    it("is zero for an empty day", () => {
      expect(dayProgress([], "2026-10-05")).toEqual({ done: 0, total: 0 });
    });
  });

  describe("patches", () => {
    it("statusPatch changes only the status", () => {
      const t = task("a", "2026-10-05", "todo", { tags: ["x"] });
      expect(statusPatch(t, "done")).toEqual({ ...t, status: "done" });
      expect(t.status).toBe("todo");
    });

    it("reschedulePatch changes only the due date and never the status", () => {
      const t = task("a", "2026-10-01", "blocked");
      const moved = reschedulePatch(t, "2026-10-05");
      expect(moved).toEqual({ ...t, dueDate: "2026-10-05" });
      expect(moved.status).toBe("blocked");
    });

    it("reschedulePatch to no date keeps an explicit undefined dueDate so the API clears it", () => {
      const moved = reschedulePatch(task("a", "2026-10-01"), undefined);
      expect("dueDate" in moved).toBe(true);
      expect(moved.dueDate).toBeUndefined();
    });

    it("titlePatch trims and changes only the title", () => {
      const t = task("a", "2026-10-05", "blocked");
      expect(titlePatch(t, "  New title ")).toEqual({ ...t, title: "New title" });
    });

    it("titlePatch rejects a blank title", () => {
      expect(titlePatch(task("a"), "   ")).toBeNull();
    });

    it("commentPatch trims and sets the description", () => {
      expect(commentPatch(task("a"), " note ").description).toBe("note");
    });

    it("commentPatch clears a blank comment but keeps the key so the API clears it", () => {
      const cleared = commentPatch(task("a", undefined, "todo", { description: "old" }), "  ");
      expect("description" in cleared).toBe(true);
      expect(cleared.description).toBeUndefined();
    });
  });
});
