import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DashboardStore } from "@/lib/types";

// In-memory stand-in for db.ts. `staleFirst` simulates a Blob retry: the updater runs once
// against a stale store (result discarded), then against the current one.
let current: DashboardStore;
let staleFirst: DashboardStore | null = null;

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
    recurringTasks: [],
    lastUpdated: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

vi.mock("@/lib/db", () => ({
  readStore: async () => current,
  updateStore: async (fn: (s: DashboardStore) => DashboardStore) => {
    if (staleFirst) fn(staleFirst);
    current = fn(current);
    return current;
  },
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/recurring-tasks/route";
import { POST as generate } from "@/app/api/recurring-tasks/generate/route";

function json(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"), {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
  });
}

const TODAY = "2026-10-05";
const DAILY = { title: "Sync", cadence: "daily", startDate: TODAY, today: TODAY };

beforeEach(() => {
  current = makeStore();
  staleFirst = null;
});

describe("/api/recurring-tasks", () => {
  it("POST creates a rule and today's and tomorrow's rows", async () => {
    const res = await POST(json("POST", "/api/recurring-tasks", DAILY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(current.recurringTasks).toHaveLength(1);
    expect(current.tasks.map((t) => t.dueDate)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(current.tasks.every((t) => t.recurringId === body.rule.id && t.source === "manual")).toBe(true);
  });

  it("POST rejects bad input with a 400 and writes nothing", async () => {
    const cases = [
      { ...DAILY, title: "" },
      { ...DAILY, cadence: "weekly", weekdays: [] },
      { ...DAILY, cadence: "monthly", monthlyMode: "day_of_month" },
      { ...DAILY, endDate: "2026-10-01" },
      { title: "x", cadence: "daily", startDate: TODAY },
      { ...DAILY, startDate: "2026-02-30" },
    ];
    for (const body of cases) {
      const res = await POST(json("POST", "/api/recurring-tasks", body));
      expect(res.status).toBe(400);
    }
    expect(current.recurringTasks).toEqual([]);
    expect(current.tasks).toEqual([]);
  });

  it("POST enforces the 100 rule cap with the user-facing message", async () => {
    current = makeStore({
      recurringTasks: Array.from({ length: 100 }, (_, i) => ({
        id: `r${i}`,
        title: "t",
        cadence: "daily" as const,
        startDate: "2026-01-01",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    });
    const res = await POST(json("POST", "/api/recurring-tasks", DAILY));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "You have reached 100 recurring tasks. Delete one to add more."
    );
  });

  it("creates no duplicate rows when the updater is retried against a stale store", async () => {
    staleFirst = makeStore();
    await POST(json("POST", "/api/recurring-tasks", DAILY));
    expect(current.tasks).toHaveLength(2);
  });

  it("GET lists rules and tolerates a store without the key", async () => {
    const legacy = makeStore();
    delete legacy.recurringTasks;
    current = legacy;
    expect(await (await GET()).json()).toEqual([]);
  });

  it("PATCH edits, pauses and resumes; 404 for an unknown id; 400 for an invalid merge", async () => {
    const created = await (await POST(json("POST", "/api/recurring-tasks", DAILY))).json();
    const id = created.rule.id;
    const patch = (body: Record<string, unknown>) =>
      PATCH(json("PATCH", "/api/recurring-tasks", { today: TODAY, ...body }));

    expect((await patch({ id, active: false })).status).toBe(200);
    expect(current.recurringTasks![0].active).toBe(false);
    expect(current.tasks.map((t) => t.dueDate)).toEqual(["2026-10-05"]);

    expect((await patch({ id, active: true })).status).toBe(200);
    expect(current.recurringTasks![0].active).toBe(true);

    expect((await patch({ id, title: "Renamed", comment: null })).status).toBe(200);
    expect(current.tasks.find((t) => t.dueDate === "2026-10-06")?.title).toBe("Renamed");

    expect((await patch({ id: "nope", title: "x" })).status).toBe(404);
    expect((await patch({ id, endDate: "2026-01-01" })).status).toBe(400);
    expect((await patch({ id })).status).toBe(400);
  });

  it("DELETE removes the rule and detaches its remaining rows", async () => {
    const created = await (await POST(json("POST", "/api/recurring-tasks", DAILY))).json();
    const id = created.rule.id;
    const res = await DELETE(json("DELETE", `/api/recurring-tasks?id=${id}&today=${TODAY}`));
    expect(res.status).toBe(200);
    expect(current.recurringTasks).toEqual([]);
    expect(current.tasks).toHaveLength(1);
    expect(current.tasks[0].recurringId).toBeUndefined();

    const again = await DELETE(json("DELETE", `/api/recurring-tasks?id=${id}&today=${TODAY}`));
    expect(again.status).toBe(404);
    expect((await DELETE(json("DELETE", "/api/recurring-tasks"))).status).toBe(400);
  });
});

describe("/api/recurring-tasks/generate", () => {
  const post = (body: unknown) => generate(json("POST", "/api/recurring-tasks/generate", body));

  it("creates due rows once; repeated calls create nothing", async () => {
    await POST(json("POST", "/api/recurring-tasks", DAILY));
    expect((await (await post({ today: "2026-10-06" })).json()).created).toBe(1);
    expect((await (await post({ today: "2026-10-06" })).json()).created).toBe(0);
    expect(current.tasks.map((t) => t.dueDate)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });

  it("uses the client's today, not the server clock", async () => {
    await POST(json("POST", "/api/recurring-tasks", { ...DAILY, startDate: "2030-01-01" }));
    const res = await (await post({ today: "2030-01-01" })).json();
    expect(res.created).toBe(2);
    expect(current.tasks.map((t) => t.dueDate)).toEqual(["2030-01-01", "2030-01-02"]);
  });

  it("rejects a missing or malformed today", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ today: "tomorrow" })).status).toBe(400);
  });

  it("does nothing when there are no rules", async () => {
    expect(await (await post({ today: TODAY })).json()).toEqual({ created: 0 });
    expect(current.tasks).toEqual([]);
  });
});
