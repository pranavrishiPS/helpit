import { describe, expect, it } from "vitest";
import {
  parseDueDate,
  parseLocalActions,
  findTaskByMatch,
} from "@/lib/assistant-actions";
import type { DashboardStore } from "@/lib/types";

const mockStore: DashboardStore = {
  profile: { name: "Alex", role: "Producer", company: "Test Co" },
  tasks: [
    {
      id: "1",
      title: "Review Q3 calendar",
      status: "todo",
      priority: "high",
      source: "manual",
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "2",
      title: "Art follow-up",
      status: "todo",
      priority: "medium",
      source: "slack",
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  releases: [],
  outings: [],
  slackItems: [],
  mailItems: [],
  sprintApprovals: [],
  lastUpdated: new Date().toISOString(),
};

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
});

describe("parseLocalActions", () => {
  it("creates a task from natural language", () => {
    const actions = parseLocalActions("Add task: Ship hotfix high priority due tomorrow");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "create_task" });
    if (actions[0].type === "create_task") {
      expect(actions[0].title).toContain("Ship hotfix");
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
});

describe("findTaskByMatch", () => {
  it("prefers exact matches", () => {
    const task = findTaskByMatch(mockStore, "Review Q3 calendar");
    expect(task?.id).toBe("1");
  });

  it("returns undefined for ambiguous matches", () => {
    const store = {
      ...mockStore,
      tasks: [
        ...mockStore.tasks,
        {
          id: "3",
          title: "Review Q3 calendar draft",
          status: "todo" as const,
          priority: "low" as const,
          source: "manual" as const,
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    expect(findTaskByMatch(store, "review")).toBeUndefined();
  });
});
