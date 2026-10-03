import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardStore, Task } from "@/lib/types";

let currentStore: DashboardStore;
const updateStoreMock = vi.fn(async (fn: (s: DashboardStore) => DashboardStore) => {
  currentStore = fn(currentStore);
  return currentStore;
});

vi.mock("@/lib/db", () => ({
  updateStore: (fn: (s: DashboardStore) => DashboardStore) => updateStoreMock(fn),
}));

import {
  executeActions,
  extractTrailingModifiers,
  findTaskByMatch,
  looksLikeWriteIntent,
  parseDueDate,
  parseLocalActions,
  toolCallToAction,
  validateAction,
} from "@/lib/assistant-actions";

const stamp = new Date().toISOString();

function task(id: string, title: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title,
    status: "todo",
    priority: "medium",
    source: "manual",
    tags: [],
    createdAt: stamp,
    updatedAt: stamp,
    ...extra,
  };
}

function makeStore(tasks: Task[]): DashboardStore {
  return {
    profile: { name: "Alex", role: "Producer", company: "Test Co" },
    tasks,
    releases: [],
    outings: [],
    slackItems: [],
    mailItems: [],
    sprintApprovals: [],
    projectResources: [],
    plotBacklog: [],
    features: [],
    scrumMembers: [],
    scrumAttendance: [],
    scrumHolidays: [],
    lastUpdated: stamp,
  };
}

const mockStore = makeStore([
  task("1", "Review Q3 calendar", { priority: "high" }),
  task("2", "Art follow-up", { source: "slack" }),
]);

beforeEach(() => {
  currentStore = makeStore([...mockStore.tasks]);
  updateStoreMock.mockClear();
});

describe("parseDueDate", () => {
  it("parses today and tomorrow", () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    expect(parseDueDate("today")).toBe(`${yyyy}-${mm}-${dd}`);
  });

  it("parses ISO dates", () => {
    expect(parseDueDate("due 2026-07-15")).toBe("2026-07-15");
  });

  it("reads slash dates as day/month (India)", () => {
    expect(parseDueDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDueDate("31/12/26")).toBe("2026-12-31");
    expect(parseDueDate("1/2/2027")).toBe("2027-02-01");
  });

  it("rejects impossible dates", () => {
    expect(parseDueDate("2026-02-30")).toBeUndefined();
    expect(parseDueDate("12/31/2026")).toBeUndefined(); // month 31
    expect(parseDueDate("whenever")).toBeUndefined();
  });
});

describe("looksLikeWriteIntent", () => {
  it("needs an imperative at the start and no question", () => {
    expect(looksLikeWriteIntent("Add task: x")).toBe(true);
    expect(looksLikeWriteIntent("please mark art follow-up done")).toBe(true);
    expect(looksLikeWriteIntent("can I mark the release review complete?")).toBe(false);
    expect(looksLikeWriteIntent("what's done in the market for Art?")).toBe(false);
    expect(looksLikeWriteIntent("I want to mark art done")).toBe(false);
  });
});

describe("parseLocalActions: question phrasing never mutates", () => {
  const questions = [
    "can I mark the release review complete?",
    "what's done in the market for Art?",
    "Should I finish Art follow-up today?",
    "is Review Q3 calendar done?",
    "how do I mark a task complete",
    "when will the art follow-up be complete",
    "mark the art follow-up complete?",
    "I think the Art follow-up is done, remind me later",
    "Please tell me what to mark done",
    "Art follow-up is done",
  ];
  for (const q of questions) {
    it(`ignores: ${q}`, () => {
      expect(parseLocalActions(q)).toEqual([]);
    });
  }
});

describe("parseLocalActions: imperative phrasing", () => {
  it("creates a task from natural language", () => {
    const actions = parseLocalActions("Add task: Ship hotfix high priority due tomorrow");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: "create_task",
      title: "Ship hotfix",
      priority: "high",
    });
    if (actions[0].type === "create_task") {
      expect(actions[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("marks a task done", () => {
    const actions = parseLocalActions('Mark task "Review Q3 calendar" as done');
    expect(actions[0]).toMatchObject({
      type: "update_task",
      titleMatch: "Review Q3 calendar",
      status: "done",
    });
  });

  it("accepts polite and short imperatives", () => {
    expect(parseLocalActions("please complete art follow-up")[0]).toMatchObject({
      type: "update_task",
      titleMatch: "art follow-up",
      status: "done",
    });
    expect(parseLocalActions("mark the art follow-up done")[0]).toMatchObject({
      type: "update_task",
      titleMatch: "art follow-up",
    });
  });

  it("does not treat Slack completion as a task completion", () => {
    expect(parseLocalActions("mark slack item reward table")[0]).toMatchObject({
      type: "complete_slack_item",
    });
  });
});

describe("add-task parsing", () => {
  it("keeps ordinary words that look like dates or priorities", () => {
    const friday = parseLocalActions("Add task: Fix Friday event bug");
    expect(friday[0]).toMatchObject({ type: "create_task", title: "Fix Friday event bug" });
    if (friday[0].type === "create_task") expect(friday[0].dueDate).toBeUndefined();

    const high = parseLocalActions("Add task: Review high score table");
    expect(high[0]).toMatchObject({
      type: "create_task",
      title: "Review high score table",
      priority: "medium",
    });
  });

  it("parses explicit trailing phrases", () => {
    expect(extractTrailingModifiers("Fix login, high")).toMatchObject({
      title: "Fix login",
      priority: "high",
    });
    expect(extractTrailingModifiers("Fix login priority urgent")).toMatchObject({
      title: "Fix login",
      priority: "urgent",
    });
    expect(extractTrailingModifiers("Fix login, due 2026-11-02, low")).toMatchObject({
      title: "Fix login",
      priority: "low",
      dueDate: "2026-11-02",
    });
  });

  it("normalises slash dates as dd/mm to yyyy-MM-dd", () => {
    const actions = parseLocalActions("Add task: File report due 05/10/2026");
    expect(actions[0]).toMatchObject({
      type: "create_task",
      title: "File report",
      dueDate: "2026-10-05",
    });
  });

  it("never stores an unparsed due date", () => {
    const actions = parseLocalActions("Add task: File report due 31/02/2026");
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("invalid_action");

    const csv = parseLocalActions("Add data:\ntitle, priority, due\nShip build, high, someday");
    expect(csv.every((a) => a.type === "invalid_action")).toBe(true);
  });

  it("leaves 'due to' prose alone", () => {
    expect(parseLocalActions("Add task: Triage crash due to memory leak")[0]).toMatchObject({
      title: "Triage crash due to memory leak",
    });
  });

  it("only strips a trailing reminder date", () => {
    const keep = parseLocalActions("Remind me to review Friday event bug");
    expect(keep[0]).toMatchObject({ title: "review Friday event bug" });
    const trail = parseLocalActions("Remind me to ship build on 05/10/2026");
    expect(trail[0]).toMatchObject({ title: "ship build", dueDate: "2026-10-05" });
  });

  it("parses a trailing due date and priority without commas, in either order", () => {
    const cases = [
      "X due 10/10 high",
      "X due 10/10, high",
      "X, due 10/10, high",
      "X high due 10/10",
      "X, high, due 10/10",
      "X due 10/10 high priority",
      "X due 10/10 priority high",
      "X high priority due 10/10",
    ];
    for (const text of cases) {
      const actions = parseLocalActions(`add task: ${text}`);
      expect(actions, text).toHaveLength(1);
      expect(actions[0], text).toMatchObject({
        type: "create_task",
        title: "X",
        priority: "high",
        dueDate: `${new Date().getFullYear()}-10-10`,
      });
    }
  });

  it("still keeps titles that merely contain priority or date words", () => {
    expect(parseLocalActions("add task: Review high score table due 10/10")[0]).toMatchObject({
      title: "Review high score table",
      priority: "medium",
    });
    expect(parseLocalActions("add task: Fix Friday event bug high")[0]).toMatchObject({
      title: "Fix Friday event bug high",
      priority: "medium",
    });
  });

  it("reads a leading reminder date ('remind me on 12/10 to call Bob')", () => {
    const year = new Date().getFullYear();
    for (const text of [
      "remind me on 12/10 to call Bob",
      "Remind me by 12/10 to call Bob",
      "remind me 12/10 to call Bob",
      "add reminder for 12/10 to call Bob",
    ]) {
      const actions = parseLocalActions(text);
      expect(actions, text).toHaveLength(1);
      expect(actions[0], text).toMatchObject({
        type: "create_task",
        title: "call Bob",
        dueDate: `${year}-10-12`,
      });
    }
  });

  it("does not create a task from a reminder question", () => {
    expect(parseLocalActions("Remind me what's due")).toEqual([]);
    expect(parseLocalActions("remind me what is due today")).toEqual([]);
    expect(parseLocalActions("Remind me when the build ships")).toEqual([]);
    // a real reminder is still created
    expect(parseLocalActions("Remind me to do the review")[0]).toMatchObject({
      type: "create_task",
      title: "do the review",
    });
  });

  it("parses CSV rows with dd/mm dates", () => {
    const actions = parseLocalActions("Add data:\ntitle, priority, due\nShip build, high, 05/10/2026");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: "create_task",
      title: "Ship build",
      priority: "high",
      dueDate: "2026-10-05",
    });
  });

  it("does not eat leading digits in bulk lists", () => {
    const actions = parseLocalActions("Add tasks:\n- 2027 plan review\n2) Call vendor");
    expect(actions.map((a) => (a.type === "create_task" ? a.title : ""))).toEqual([
      "2027 plan review",
      "Call vendor",
    ]);
  });
});

describe("findTaskByMatch", () => {
  it("prefers exact matches", () => {
    const task = findTaskByMatch(mockStore, "Review Q3 calendar");
    expect(task?.id).toBe("1");
  });

  it("returns undefined for ambiguous matches", () => {
    const store = makeStore([
      ...mockStore.tasks,
      task("3", "Review Q3 calendar draft", { priority: "low" }),
    ]);
    expect(findTaskByMatch(store, "review")).toBeUndefined();
  });

  it("does not match a short task title found inside a longer message", () => {
    const store = makeStore([task("9", "Art")]);
    expect(findTaskByMatch(store, "what's done in the market for Art")).toBeUndefined();
  });
});

describe("executeActions", () => {
  it("does nothing and asks when several tasks match", async () => {
    currentStore = makeStore([
      task("1", "Art follow-up for UX"),
      task("2", "Art follow-up for Dev"),
    ]);
    const results = await executeActions([
      { type: "update_task", titleMatch: "art follow-up", status: "done" },
    ]);
    expect(results[0].success).toBe(false);
    expect(results[0].detail).toMatch(/Several tasks match/);
    expect(currentStore.tasks.every((t) => t.status === "todo")).toBe(true);
  });

  it("completes a single unambiguous match", async () => {
    const results = await executeActions([
      { type: "update_task", titleMatch: "art follow-up", status: "done" },
    ]);
    expect(results[0].success).toBe(true);
    expect(currentStore.tasks.find((t) => t.id === "2")?.status).toBe("done");
  });

  it("only the final optimistic-retry attempt decides the outcome (ambiguous then unique)", async () => {
    const ambiguousStore = makeStore([
      task("1", "Art follow-up for UX"),
      task("2", "Art follow-up for Dev"),
    ]);
    const uniqueStore = makeStore([task("1", "Art follow-up for UX")]);
    updateStoreMock.mockImplementationOnce(async (fn) => {
      fn(ambiguousStore); // attempt 1: lost the write race, result discarded
      currentStore = fn(uniqueStore); // attempt 2: wins
      return currentStore;
    });
    const results = await executeActions([
      { type: "update_task", titleMatch: "art follow-up", status: "done" },
    ]);
    expect(results[0].success).toBe(true);
    expect(currentStore.tasks[0].status).toBe("done");
  });

  it("only the final optimistic-retry attempt decides the outcome (found then missing)", async () => {
    const withTask = makeStore([task("1", "Art follow-up")]);
    const withoutTask = makeStore([]);
    updateStoreMock.mockImplementationOnce(async (fn) => {
      fn(withTask); // attempt 1 matched, but its write was discarded
      currentStore = fn(withoutTask); // attempt 2: task was deleted concurrently
      return currentStore;
    });
    const results = await executeActions([
      { type: "update_task", titleMatch: "art follow-up", status: "done" },
    ]);
    expect(results[0].success).toBe(false);
    expect(results[0].detail).toMatch(/No task matching/);
  });

  it("rejects invalid actions without touching the store", async () => {
    const results = await executeActions([
      { type: "create_task", title: "  ", priority: "high" },
      { type: "create_task", title: "x", dueDate: "tomorrow" },
      { type: "create_task", title: "x", dueDate: "2026-02-30" },
      { type: "update_task", titleMatch: "Art follow-up", status: "finished" as never },
      { type: "update_task", titleMatch: "Art follow-up" },
      { type: "invalid_action", reason: "nope" },
    ]);
    expect(results.every((r) => !r.success)).toBe(true);
    expect(updateStoreMock).not.toHaveBeenCalled();
  });
});

describe("toolCallToAction (untrusted model output)", () => {
  it("accepts valid args", () => {
    expect(
      toolCallToAction("create_task", { title: "Ship", priority: "high", dueDate: "2026-11-02" })
    ).toEqual({ type: "create_task", title: "Ship", priority: "high", dueDate: "2026-11-02" });
  });

  it("rejects missing titles instead of storing 'undefined'", () => {
    expect(toolCallToAction("create_task", {}).type).toBe("invalid_action");
    expect(toolCallToAction("create_task", { title: 42 }).type).toBe("invalid_action");
    expect(toolCallToAction("update_task", { status: "done" }).type).toBe("invalid_action");
  });

  it("rejects bad enums and dates", () => {
    expect(toolCallToAction("create_task", { title: "x", priority: "asap" }).type).toBe(
      "invalid_action"
    );
    expect(toolCallToAction("create_task", { title: "x", dueDate: "next week" }).type).toBe(
      "invalid_action"
    );
    expect(
      toolCallToAction("update_task", { titleMatch: "x", status: "archived" }).type
    ).toBe("invalid_action");
  });

  it("rejects unsupported tools such as deletes", () => {
    for (const name of ["delete_task", "delete_all", "__proto__", "constructor"]) {
      expect(toolCallToAction(name, { titleMatch: "x" }).type).toBe("invalid_action");
    }
  });

  it("ignores fields the tool does not define", () => {
    const action = toolCallToAction("create_task", { title: "x", status: "done", id: "9" });
    expect(action).toEqual({ type: "create_task", title: "x" });
  });

  it("validateAction rejects actions that bypass the tool path", () => {
    const result = validateAction({
      type: "update_task",
      titleMatch: "x",
      priority: "critical" as never,
    });
    expect(result.success).toBe(false);
  });
});
