import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DashboardStore } from "@/lib/types";
import { applyLrp2027Seed } from "@/lib/lrp-2027-seed";
import { capacityTotals, rowsForTab } from "@/lib/lrp-2027";

let current: DashboardStore;

vi.mock("@/lib/db", () => ({
  readStore: async () => current,
  updateStore: async (fn: (s: DashboardStore) => DashboardStore) => {
    current = fn(current);
    return current;
  },
}));

import { DELETE, PATCH, POST, PUT } from "@/app/api/lrp-2027/route";
import { swagSavePayload, applySwagEdit } from "@/lib/swag-draft";

function json(method: string, body?: unknown, query = ""): NextRequest {
  return new NextRequest(new URL(`/api/lrp-2027${query}`, "http://localhost"), {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  current = applyLrp2027Seed(
    {
      profile: { name: "Pranav", role: "Game Producer", company: "PlaySimple Games" },
      tasks: [],
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
      lastUpdated: "2026-01-01T00:00:00.000Z",
    },
    "2026-10-13T00:00:00.000Z"
  );
});

describe("/api/lrp-2027", () => {
  it("PATCH capacity updates headcount and a month; totals recompute", async () => {
    const res = await PATCH(
      json("PATCH", { action: "capacity", headcount: { dev: 3 }, month: { index: 0, holidays: 2 } })
    );
    expect(res.status).toBe(200);
    expect(current.capacityPlan!.headcount.dev).toBe(3);
    expect(current.capacityPlan!.months[0].holidays).toBe(2);
    expect(capacityTotals(current.capacityPlan!).holidays).toBe(5);
  });

  it("PATCH capacity applies a whole draft (year, headcount, several months) in one call", async () => {
    const res = await PATCH(
      json("PATCH", {
        action: "capacity",
        year: 2028,
        headcount: { qa: 1 },
        months: [
          { index: 1, leaves: 1 },
          { index: 11, workingDays: 22, holidays: 1 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const plan = current.capacityPlan!;
    expect(plan.year).toBe(2028);
    expect(plan.headcount.qa).toBe(1);
    expect(plan.months[1]).toMatchObject({ workingDays: 20, holidays: 0, leaves: 1 });
    expect(plan.months[11]).toMatchObject({ workingDays: 22, holidays: 1, leaves: 2.41 });
    expect((await PATCH(json("PATCH", { action: "capacity", months: [{ index: 12, leaves: 1 }] }))).status).toBe(400);
  });

  it("PATCH capacity rejects negative numbers", async () => {
    const res = await PATCH(json("PATCH", { action: "capacity", headcount: { qa: -1 } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Must be 0 or more.");
  });

  it("POST requires a feature name and adds to the end of the tab", async () => {
    expect((await POST(json("POST", { tab: "adhoc", featureName: "  " }))).status).toBe(400);
    const res = await POST(json("POST", { tab: "adhoc", featureName: "New idea" }));
    expect(res.status).toBe(201);
    const row = await res.json();
    expect(row).toMatchObject({ tab: "adhoc", featureName: "New idea", order: 0 });
    expect(row.owner).toBeUndefined();
    expect(row.costs).toEqual({ spec: {}, ux: {}, art: {}, ta: {}, dev: {}, qa: {} });
  });

  it("PATCH row sets and clears cells (blank = missing)", async () => {
    const id = current.swagCosting![2].id; // Two-Act Quotes
    let res = await PATCH(json("PATCH", { action: "row", id, costs: { qa: { days: 5 } } }));
    expect(res.status).toBe(200);
    expect(current.swagCosting![2].costs.qa).toEqual({ size: "S(2-5)", days: 5 });

    res = await PATCH(json("PATCH", { action: "row", id, costs: { qa: { days: null } }, priority: "" }));
    expect(res.status).toBe(200);
    expect(current.swagCosting![2].costs.qa).toEqual({ size: "S(2-5)" });
    expect("priority" in current.swagCosting![2]).toBe(false);
  });

  it("PATCH row rejects an empty feature name", async () => {
    const id = current.swagCosting![0].id;
    const res = await PATCH(json("PATCH", { action: "row", id, featureName: " " }));
    expect(res.status).toBe(400);
    expect(current.swagCosting![0].featureName).toBe("Streak Week Strip");
  });

  it("PATCH move moves to the other tab and back to the same position", async () => {
    const id = current.swagCosting![4].id;
    await PATCH(json("PATCH", { action: "move", id, tab: "adhoc" }));
    expect(rowsForTab(current.swagCosting!, "adhoc").map((r) => r.id)).toEqual([id]);
    await PATCH(json("PATCH", { action: "move", id, tab: "lrp", index: 4 }));
    expect(rowsForTab(current.swagCosting!, "lrp")[4].id).toBe(id);
  });

  it("DELETE removes a row; unknown id is 404", async () => {
    const id = current.swagCosting![0].id;
    expect((await DELETE(json("DELETE", undefined, `?id=${id}`))).status).toBe(200);
    expect(current.swagCosting).toHaveLength(29);
    expect((await DELETE(json("DELETE", undefined, `?id=${id}`))).status).toBe(404);
  });

  describe("PUT bulk save (Swag Costing draft)", () => {
    it("applies adds, edits, moves and deletes in one call; keeps createdAt and owner", async () => {
      const saved = current.swagCosting!;
      let draft = applySwagEdit(saved, {
        kind: "add",
        row: {
          id: "client-1",
          tab: "adhoc",
          order: 0,
          featureName: "New idea",
          costs: { spec: {}, ux: {}, art: {}, ta: {}, dev: { size: "S(2-5)", days: 4 }, qa: {} },
          createdAt: "x",
          updatedAt: "x",
        },
      });
      draft = applySwagEdit(draft, { kind: "patch", id: saved[3].id, patch: { costs: { qa: { days: 5 } } } });
      draft = applySwagEdit(draft, { kind: "move", id: saved[4].id, tab: "adhoc" });
      draft = applySwagEdit(draft, { kind: "delete", id: saved[0].id });

      const res = await PUT(json("PUT", swagSavePayload(saved, draft)));
      expect(res.status).toBe(200);
      const rows = current.swagCosting!;
      expect(rows).toHaveLength(30);
      expect(rows.find((r) => r.id === saved[0].id)).toBeUndefined();
      const butterfly = rows.find((r) => r.id === saved[3].id)!;
      expect(butterfly.costs.qa).toEqual({ size: "S(2-5)", days: 5 });
      expect(butterfly.owner).toBe("Aryan");
      expect(butterfly.createdAt).toBe(saved[3].createdAt);
      expect(rowsForTab(rows, "adhoc").map((r) => r.id)).toEqual(["client-1", saved[4].id]);
      const created = rows.find((r) => r.id === "client-1")!;
      expect(created.createdAt).not.toBe("x");
      expect((await res.json()).rows).toHaveLength(30);
    });

    it("is all-or-nothing: one invalid row rejects the whole save", async () => {
      const before = current.swagCosting;
      const good = { ...current.swagCosting![1] } as Record<string, unknown>;
      delete good.createdAt;
      delete good.updatedAt;
      const bad = { ...good, id: "bad", featureName: " " };
      const res = await PUT(json("PUT", { upserts: [{ ...good, priority: "P1" }, bad], deletes: [before![0].id] }));
      expect(res.status).toBe(400);
      expect(current.swagCosting).toBe(before);
    });

    it("rejects negative days, duplicate ids and save+delete of the same row", async () => {
      const row = { ...current.swagCosting![1] } as Record<string, unknown>;
      delete row.createdAt;
      delete row.updatedAt;
      const negative = { ...row, costs: { ...(row.costs as object), qa: { days: -1 } } };
      expect((await PUT(json("PUT", { upserts: [negative], deletes: [] }))).status).toBe(400);
      expect((await PUT(json("PUT", { upserts: [row, row], deletes: [] }))).status).toBe(400);
      expect((await PUT(json("PUT", { upserts: [row], deletes: [row.id] }))).status).toBe(400);
      expect((await PUT(json("PUT", { upserts: [{ ...row, createdAt: "x" }], deletes: [] }))).status).toBe(400);
    });
  });
});
