import { describe, expect, it } from "vitest";
import { rowsForTab, swagRoi, swagTotal } from "@/lib/lrp-2027";
import { seedSwagRows } from "@/lib/lrp-2027-seed";
import {
  applySwagEdit,
  initSwagDraft,
  sameSwagRows,
  swagChanges,
  swagDraftReducer,
  swagSavePayload,
  type SwagDraftState,
  type SwagEdit,
} from "@/lib/swag-draft";
import type { SwagCostingRow } from "@/lib/types";

const NOW = "2026-10-13T00:00:00.000Z";
const seeded = seedSwagRows(NOW);

function edit(s: SwagDraftState, e: SwagEdit) {
  return swagDraftReducer(s, { type: "edit", edit: e });
}

const newRow: SwagCostingRow = {
  id: "new-1",
  tab: "adhoc",
  order: 0,
  featureName: "New idea",
  costs: { spec: {}, ux: {}, art: {}, ta: {}, dev: {}, qa: {} },
  createdAt: NOW,
  updatedAt: NOW,
};

describe("swag draft reducer", () => {
  it("patches a cell in the draft only; Total/ROI follow the draft", () => {
    let s = initSwagDraft(seeded);
    const butterfly = seeded[3];
    s = edit(s, { kind: "patch", id: butterfly.id, patch: { costs: { qa: { days: 5 } } } });
    expect(s.saved).toBe(seeded);
    const row = s.draft.find((r) => r.id === butterfly.id)!;
    expect(row.costs.qa).toEqual({ size: "S(2-5)", days: 5 });
    expect(swagTotal(row)).toBe(29);
    expect(swagRoi(row)).toBeCloseTo(1.43 / 29, 10);
    expect([...swagChanges(s.saved, s.draft).cells]).toEqual([`${butterfly.id}:cost-qa`]);
  });

  it("add, delete and move are undoable and redoable", () => {
    let s = initSwagDraft(seeded);
    s = edit(s, { kind: "add", row: newRow });
    s = edit(s, { kind: "delete", id: seeded[0].id });
    s = edit(s, { kind: "move", id: seeded[1].id, tab: "adhoc" });
    expect(rowsForTab(s.draft, "adhoc").map((r) => r.id)).toEqual(["new-1", seeded[1].id]);
    expect(rowsForTab(s.draft, "lrp")).toHaveLength(28);

    const c = swagChanges(s.saved, s.draft);
    expect(c.added).toEqual(new Set(["new-1"]));
    expect(c.deleted).toEqual([seeded[0].id]);
    expect(c.cells.has(`${seeded[1].id}:tab`)).toBe(true);
    expect(c.count).toBe(3);

    s = swagDraftReducer(s, { type: "undo" });
    expect(rowsForTab(s.draft, "adhoc").map((r) => r.id)).toEqual(["new-1"]);
    s = swagDraftReducer(s, { type: "undo" });
    s = swagDraftReducer(s, { type: "undo" });
    expect(sameSwagRows(s.draft, seeded)).toBe(true);
    expect(swagChanges(s.saved, s.draft).count).toBe(0);

    s = swagDraftReducer(s, { type: "redo" });
    expect(s.draft.some((r) => r.id === "new-1")).toBe(true);
    expect(s.future).toHaveLength(2);
  });

  it("no-op edits add no undo step", () => {
    const s = initSwagDraft(seeded);
    expect(edit(s, { kind: "patch", id: seeded[0].id, patch: { featureName: seeded[0].featureName } })).toBe(s);
    expect(edit(s, { kind: "delete", id: "missing" })).toBe(s);
    expect(edit(s, { kind: "move", id: seeded[0].id, tab: "lrp" })).toBe(s);
  });

  it("blank clears a field (missing, never 0) and other fields are kept, incl. hidden owner", () => {
    const rows = applySwagEdit(seeded, {
      kind: "patch",
      id: seeded[0].id,
      patch: { eoPercent: null, priority: "", costs: { spec: { days: null } } },
    });
    const row = rows[0];
    expect("eoPercent" in row).toBe(false);
    expect(row.costs.spec).toEqual({ size: "XS(0-2)" });
    expect(row.owner).toBe("Pranav");
  });

  it("reset clears history after Save", () => {
    let s = edit(initSwagDraft(seeded), { kind: "add", row: newRow });
    s = swagDraftReducer(s, { type: "reset", value: s.draft });
    expect(s.past).toEqual([]);
    expect(swagChanges(s.saved, s.draft).count).toBe(0);
  });
});

describe("swag save payload", () => {
  it("is null when nothing changed", () => {
    expect(swagSavePayload(seeded, seeded)).toBeNull();
  });

  it("sends added/changed/moved rows in full (no timestamps) and deleted ids", () => {
    let s = initSwagDraft(seeded);
    s = edit(s, { kind: "add", row: newRow });
    s = edit(s, { kind: "patch", id: seeded[2].id, patch: { priority: "P1" } });
    s = edit(s, { kind: "delete", id: seeded[5].id });
    s = edit(s, { kind: "move", id: seeded[6].id, tab: "adhoc" });
    const payload = swagSavePayload(s.saved, s.draft)!;
    expect(payload.deletes).toEqual([seeded[5].id]);
    const ids = payload.upserts.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([seeded[2].id, seeded[6].id, "new-1"]));
    expect(ids).not.toContain(seeded[0].id);
    for (const r of payload.upserts) {
      expect(r).not.toHaveProperty("createdAt");
      expect(r).not.toHaveProperty("updatedAt");
    }
    const moved = payload.upserts.find((r) => r.id === seeded[6].id)!;
    expect(moved).toMatchObject({ tab: "adhoc", owner: "Aryan" });
  });

  it("ignores timestamps when comparing with the server", () => {
    const refreshed = seeded.map((r) => ({ ...r, createdAt: "x", updatedAt: "y" }));
    expect(sameSwagRows(refreshed, seeded)).toBe(true);
  });
});
