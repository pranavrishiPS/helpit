import { describe, expect, it } from "vitest";
import { patchPerPersonInput, resolveOutingBudget } from "@/lib/outing-budget";

describe("resolveOutingBudget", () => {
  it("keeps the fixed team pool: per-person x roster wins when both are sent", () => {
    expect(resolveOutingBudget(99999, 2500, 17)).toEqual({ totalBudget: 42500, perPerson: 2500 });
  });

  it("derives total from per-person alone", () => {
    expect(resolveOutingBudget(undefined, 2500, 4)).toEqual({ totalBudget: 10000, perPerson: 2500 });
  });

  it("keeps an explicit total as-is and does not store a rounded per-person (10000 / 3)", () => {
    const resolved = resolveOutingBudget(10000, undefined, 3);
    expect(resolved).toEqual({ totalBudget: 10000, perPerson: undefined });
  });

  it("derives per-person when the total divides evenly", () => {
    expect(resolveOutingBudget(10000, undefined, 4)).toEqual({ totalBudget: 10000, perPerson: 2500 });
  });

  it("returns null when no total can be determined", () => {
    expect(resolveOutingBudget(undefined, undefined, 3)).toBeNull();
  });
});

describe("patchPerPersonInput", () => {
  it("clears per-person when budget is sent without budgetPerPerson (explicit total wins)", () => {
    expect(patchPerPersonInput(50000, undefined, 2500)).toBeUndefined();
    expect(resolveOutingBudget(50000, patchPerPersonInput(50000, undefined, 2500), 17)).toEqual({
      totalBudget: 50000,
      perPerson: undefined,
    });
  });

  it("keeps current behaviour when both are sent", () => {
    expect(patchPerPersonInput(50000, 3000, 2500)).toBe(3000);
  });

  it("null clears, absent keeps the stored value when no budget is sent", () => {
    expect(patchPerPersonInput(undefined, null, 2500)).toBeUndefined();
    expect(patchPerPersonInput(undefined, undefined, 2500)).toBe(2500);
  });
});
