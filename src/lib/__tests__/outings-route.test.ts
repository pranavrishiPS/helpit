import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DashboardStore, Outing } from "@/lib/types";

const stamp = "2026-10-01T00:00:00.000Z";
const attendees = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((name) => ({
  name,
  confirmed: true,
}));

let current: DashboardStore;
vi.mock("@/lib/db", () => ({
  updateStore: async (fn: (s: DashboardStore) => DashboardStore) => {
    current = fn(current);
    return current;
  },
}));

import { PATCH, POST } from "@/app/api/outings/route";

function req(method: string, body: unknown): NextRequest {
  return new NextRequest(new URL("/api/outings", "http://localhost"), {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  const outing: Outing = {
    id: "o1",
    title: "Q3",
    budget: 25000,
    budgetPerPerson: 2500,
    expenses: [],
    attendees,
    createdAt: stamp,
    updatedAt: stamp,
  };
  current = {
    profile: { name: "Alex", role: "Producer", company: "Test Co" },
    tasks: [],
    releases: [],
    outings: [outing],
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
});

describe("PATCH /api/outings budget", () => {
  it("applies an explicit total even when budgetPerPerson already exists", async () => {
    const res = await PATCH(req("PATCH", { id: "o1", budget: 50000 }));
    expect(res.status).toBe(200);
    expect(current.outings[0].budget).toBe(50000);
    expect(current.outings[0].budgetPerPerson).toBe(5000);
  });

  it("does not shrink an explicit total that doesn't divide evenly (10000 / 3)", async () => {
    await PATCH(req("PATCH", { id: "o1", budget: 10000, attendees: attendees.slice(0, 3) }));
    expect(current.outings[0].budget).toBe(10000);
    expect(current.outings[0].budgetPerPerson).toBeUndefined();
    // a later team-only edit keeps the explicit total
    await PATCH(req("PATCH", { id: "o1", attendees: attendees.slice(0, 3) }));
    expect(current.outings[0].budget).toBe(10000);
  });

  it("keeps the fixed pool when both are sent (per-person wins)", async () => {
    await PATCH(req("PATCH", { id: "o1", budget: 99999, budgetPerPerson: 3000 }));
    expect(current.outings[0].budget).toBe(30000);
    expect(current.outings[0].budgetPerPerson).toBe(3000);
  });
});

describe("POST /api/outings budget", () => {
  it("does not round an explicit total (10000 / 3 members)", async () => {
    const res = await POST(
      req("POST", { title: "T", budget: 10000, attendees: attendees.slice(0, 3) })
    );
    expect(res.status).toBe(201);
    expect(current.outings[0].budget).toBe(10000);
  });
});
