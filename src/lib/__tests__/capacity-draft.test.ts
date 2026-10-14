import { describe, expect, it } from "vitest";
import {
  averagePotential,
  capacityDraftReducer,
  changedFields,
  draftPatch,
  initDraft,
  samePlanValues,
  thinMonths,
} from "@/lib/capacity-draft";
import { capacityTotals } from "@/lib/lrp-2027";
import { seedCapacityPlan } from "@/lib/lrp-2027-seed";

const plan = seedCapacityPlan("2026-10-13T00:00:00.000Z");

describe("capacity draft reducer", () => {
  it("edits the draft only, then undo/redo walk the history", () => {
    let s = initDraft(plan);
    s = capacityDraftReducer(s, { type: "edit", edit: { kind: "headcount", key: "dev", value: 3 } });
    s = capacityDraftReducer(s, { type: "edit", edit: { kind: "month", index: 0, field: "holidays", value: 2 } });
    expect(s.saved).toBe(plan);
    expect(s.draft.headcount.dev).toBe(3);
    expect(s.draft.months[0].holidays).toBe(2);
    expect(changedFields(s.saved, s.draft)).toEqual(["headcount.dev", "month.0.holidays"]);

    s = capacityDraftReducer(s, { type: "undo" });
    expect(s.draft.months[0].holidays).toBe(3);
    expect(s.draft.headcount.dev).toBe(3);
    s = capacityDraftReducer(s, { type: "undo" });
    expect(s.draft).toBe(plan);
    expect(capacityDraftReducer(s, { type: "undo" })).toBe(s);

    s = capacityDraftReducer(s, { type: "redo" });
    expect(s.draft.headcount.dev).toBe(3);
    expect(s.future).toHaveLength(1);
  });

  it("a new edit clears redo; no-op edits add no history", () => {
    let s = initDraft(plan);
    s = capacityDraftReducer(s, { type: "edit", edit: { kind: "year", value: 2028 } });
    s = capacityDraftReducer(s, { type: "undo" });
    s = capacityDraftReducer(s, { type: "edit", edit: { kind: "headcount", key: "qa", value: 1 } });
    expect(s.future).toEqual([]);
    const same = capacityDraftReducer(s, { type: "edit", edit: { kind: "headcount", key: "qa", value: 1 } });
    expect(same).toBe(s);
  });

  it("reset clears history (after Save / Discard / Reload)", () => {
    let s = capacityDraftReducer(initDraft(plan), {
      type: "edit",
      edit: { kind: "year", value: 2028 },
    });
    s = capacityDraftReducer(s, { type: "reset", plan: s.draft });
    expect(s.past).toEqual([]);
    expect(changedFields(s.saved, s.draft)).toEqual([]);
  });

  it("builds one patch with only the changed values", () => {
    let s = initDraft(plan);
    expect(draftPatch(s.saved, s.draft)).toBeNull();
    s = capacityDraftReducer(s, { type: "edit", edit: { kind: "headcount", key: "dev", value: 3 } });
    s = capacityDraftReducer(s, { type: "edit", edit: { kind: "month", index: 4, field: "leaves", value: 1.5 } });
    s = capacityDraftReducer(s, { type: "edit", edit: { kind: "year", value: 2028 } });
    expect(draftPatch(s.saved, s.draft)).toEqual({
      year: 2028,
      headcount: { dev: 3 },
      months: [{ index: 4, leaves: 1.5 }],
    });
  });

  it("compares plans ignoring updatedAt", () => {
    expect(samePlanValues(plan, { ...plan, updatedAt: "x" })).toBe(true);
    expect(samePlanValues(plan, { ...plan, year: 2030 })).toBe(false);
  });

  it("formulas are unchanged: totals still match the sheet", () => {
    const totals = capacityTotals(plan);
    expect([totals.potentialDays, totals.product, totals.dev, totals.qa]).toEqual([226.08, 904.32, 452.16, 452.16]);
  });
});

describe("thin months", () => {
  it("flags months at least 10% below the average (sheet: only Jan)", () => {
    expect(averagePotential(plan.months)).toBe(18.84);
    expect(thinMonths(plan.months)).toEqual([0]);
  });

  it("counts a month exactly 10% below; not one just above the line", () => {
    const m = (p: number) => ({ label: "x", workingDays: p, holidays: 0, leaves: 0 });
    // avg = 10, threshold = 9
    expect(thinMonths([m(9), m(11), m(10)])).toEqual([0]);
    expect(thinMonths([m(9.1), m(10.9), m(10)])).toEqual([]);
  });

  it("returns none when there is no data or nothing is available", () => {
    expect(thinMonths([])).toEqual([]);
    expect(thinMonths([{ label: "x", workingDays: 0, holidays: 0, leaves: 0 }])).toEqual([]);
  });
});
