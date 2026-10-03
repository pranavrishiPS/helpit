import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DashboardStore, Outing } from "@/lib/types";

// Blob mode re-runs the updater when the optimistic write loses a race. These tests
// simulate that: the updater runs against a stale store first (result discarded), then
// against the fresh store. Only the final run's outcome may reach the response.

const stamp = new Date().toISOString();

function makeStore(overrides: Partial<DashboardStore> = {}): DashboardStore {
  return {
    profile: { name: "Alex", role: "Producer", company: "Test Co" },
    tasks: [],
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
    ...overrides,
  };
}

let attempts: DashboardStore[] = [];
vi.mock("@/lib/db", () => ({
  updateStore: async (fn: (s: DashboardStore) => DashboardStore) => {
    let result = attempts[0];
    for (const store of attempts) result = fn(store);
    return result;
  },
}));

import { POST as addMember } from "@/app/api/scrum-attendance/members/route";
import { DELETE as deleteExpense } from "@/app/api/outings/expenses/route";
import { DELETE as deleteTask } from "@/app/api/tasks/route";
import { PATCH as patchMail } from "@/app/api/mail/route";

function json(method: string, path: string, body: unknown): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const outing = {
  id: "o1",
  title: "Outing",
  expenses: [{ id: "e1", title: "Lunch", amount: 10, type: "food" }],
} as unknown as Outing;

beforeEach(() => {
  attempts = [];
});

describe("updateStore retry: last attempt wins", () => {
  it("scrum member: duplicate on a stale attempt does not block the final add", async () => {
    attempts = [makeStore({ scrumMembers: ["Bob"] }), makeStore({ scrumMembers: [] })];
    const res = await addMember(json("POST", "/api/scrum-attendance/members", { name: "Bob" }));
    expect(res.status).toBe(201);
  });

  it("scrum member: duplicate on the final attempt is still reported", async () => {
    attempts = [makeStore({ scrumMembers: [] }), makeStore({ scrumMembers: ["Bob"] })];
    const res = await addMember(json("POST", "/api/scrum-attendance/members", { name: "bob" }));
    expect(res.status).toBe(400);
  });

  it("outing expense delete: outing found on a stale attempt, gone on the final one", async () => {
    attempts = [makeStore({ outings: [outing] }), makeStore({ outings: [] })];
    const res = await deleteExpense(
      json("DELETE", "/api/outings/expenses", { outingId: "o1", id: "e1" })
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Outing not found");
  });

  it("task delete: found on a stale attempt, gone on the final one", async () => {
    attempts = [
      makeStore({
        tasks: [
          {
            id: "t1",
            title: "x",
            status: "todo",
            priority: "medium",
            source: "manual",
            tags: [],
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
      }),
      makeStore({ tasks: [] }),
    ];
    const res = await deleteTask(
      new NextRequest(new URL("/api/tasks?id=t1", "http://localhost"), { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });

  it("mail patch: found on a stale attempt, gone on the final one", async () => {
    const mailItem = {
      id: "m1",
      subject: "s",
      from: "a@b.com",
      category: "other",
      summary: "",
      status: "unread",
      receivedAt: stamp,
    } as DashboardStore["mailItems"][number];
    attempts = [makeStore({ mailItems: [mailItem] }), makeStore({ mailItems: [] })];
    const res = await patchMail(json("PATCH", "/api/mail", { id: "m1", status: "done" }));
    expect(res.status).toBe(404);
  });
});
