import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DashboardStore } from "@/lib/types";

const stamp = "2026-10-01T00:00:00.000Z";

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

// Mirrors db.updateStore: apply the updater to the current store and keep the result.
let current: DashboardStore;
vi.mock("@/lib/db", () => ({
  updateStore: async (fn: (s: DashboardStore) => DashboardStore) => {
    current = fn(current);
    return current;
  },
}));

import { POST as postAttendance } from "@/app/api/scrum-attendance/route";
import { DELETE as deleteMember } from "@/app/api/scrum-attendance/members/route";

function postReq(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/scrum-attendance", "http://localhost"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  current = makeStore({ scrumMembers: ["Pranav", "Vrushali"] });
});

describe("POST /api/scrum-attendance", () => {
  it("rejects duplicate members in one request with 400", async () => {
    const res = await postAttendance(
      postReq({
        date: "2026-10-02",
        entries: [
          { member: "Pranav", status: "on_time" },
          { member: "pranav", status: "late" },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(current.scrumAttendance).toEqual([]);
  });

  it("rejects members that are not on the roster with a clear message", async () => {
    const res = await postAttendance(
      postReq({ date: "2026-10-02", entries: [{ member: "Stranger", status: "on_time" }] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Stranger.*roster/);
    expect(current.scrumAttendance).toEqual([]);
  });

  it("accepts roster members case-insensitively and stores the roster spelling", async () => {
    const res = await postAttendance(
      postReq({
        date: "2026-10-02",
        entries: [
          { member: "pranav", status: "on_time" },
          { member: "Vrushali", status: "leave" },
        ],
      })
    );
    expect(res.status).toBe(201);
    expect(current.scrumAttendance.map((e) => e.member).sort()).toEqual(["Pranav", "Vrushali"]);
  });
});

describe("DELETE /api/scrum-attendance/members", () => {
  function del(name: string): NextRequest {
    return new NextRequest(
      new URL(`/api/scrum-attendance/members?name=${encodeURIComponent(name)}`, "http://localhost"),
      { method: "DELETE" }
    );
  }

  it("removes a member regardless of case", async () => {
    const res = await deleteMember(del("pRaNaV"));
    expect(res.status).toBe(200);
    expect(current.scrumMembers).toEqual(["Vrushali"]);
  });

  it("leaves the store untouched when nobody matches", async () => {
    const before = current;
    await deleteMember(del("Nobody"));
    expect(current).toBe(before);
  });
});
