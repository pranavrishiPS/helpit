import { describe, expect, it } from "vitest";
import sheetExport from "../../../docs/specs/data/lrp-2027-sheet-export.json";
import {
  capacityTotals,
  formatPercent,
  indexInTab,
  isRowIncomplete,
  missingCellsLabel,
  moveSwagRow,
  parseEoPercent,
  parseNonNegative,
  potentialDays,
  rowsForTab,
  sizeLetter,
  swagRoi,
  swagTotal,
} from "@/lib/lrp-2027";
import {
  applyLrp2027Seed,
  seedCapacityPlan,
  seedGapTodos,
  seedSwagRows,
  SWAG_COL,
} from "@/lib/lrp-2027-seed";
import type { DashboardStore, SwagCostingRow } from "@/lib/types";

const NOW = "2026-10-13T00:00:00.000Z";

function baseStore(overrides: Partial<DashboardStore> = {}): DashboardStore {
  return {
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
    lastUpdated: NOW,
    ...overrides,
  };
}

function byName(rows: SwagCostingRow[], name: string): SwagCostingRow {
  const row = rows.find((r) => r.featureName.trim() === name);
  if (!row) throw new Error(`row ${name} not found`);
  return row;
}

describe("export column layout", () => {
  it("matches the positions the seed reads", () => {
    const header = sheetExport.swagcosting.header;
    expect(header[SWAG_COL.owner]).toBe("Owner");
    expect(header[SWAG_COL.featureName]).toBe("Feature Name");
    expect(header[SWAG_COL.onePager]).toBe("1-pagers");
    expect(header[SWAG_COL.eo]).toBe("EO");
    expect(header[SWAG_COL.sizes.spec]).toBe("Spec Costing");
    expect(header[SWAG_COL.sizes.qa + 1]).toBe("QA Costing Days");
    expect(header[SWAG_COL.total]).toBe("Total costing");
    expect(header[SWAG_COL.priority]).toBe("Priority");
  });
});

describe("capacity plan", () => {
  const plan = seedCapacityPlan(NOW);

  it("seeds year, headcount and 12 months from the sheet", () => {
    expect(plan.year).toBe(2027);
    expect(plan.headcount).toEqual({ product: 4, design: 1, ux: 1, uiArt: 1, animUi: 1, dev: 2, qa: 2 });
    expect(plan.months).toHaveLength(12);
    expect(plan.months[0]).toEqual({ label: "Jan", workingDays: 21, holidays: 3, leaves: 2.41 });
    expect(plan.months[8].label).toBe("Sept");
  });

  it("computes potential days per month", () => {
    expect(potentialDays(plan.months[0])).toBeCloseTo(15.59, 10);
  });

  it("totals match the sheet", () => {
    const totals = capacityTotals(plan);
    expect(totals.workingDays).toBe(261);
    expect(totals.holidays).toBe(6);
    expect(totals.leaves).toBe(28.92);
    expect(totals.potentialDays).toBe(226.08);
    expect(totals.product).toBe(904.32);
    expect(totals.design).toBe(226.08);
    expect(totals.ux).toBe(226.08);
    expect(totals.uiArt).toBe(226.08);
    expect(totals.animUi).toBe(226.08);
    expect(totals.dev).toBe(452.16);
    expect(totals.qa).toBe(452.16);
    const sheet = sheetExport.capacityPlan.sheetTotals;
    expect(totals.potentialDays).toBe(sheet.potentialDays);
    expect(totals.product).toBe(sheet.product);
    expect(totals.dev).toBe(sheet.dev);
    expect(totals.qa).toBe(sheet.qa);
  });

  it("recomputes when headcount changes", () => {
    const totals = capacityTotals({ ...plan, headcount: { ...plan.headcount, dev: 3 } });
    expect(totals.dev).toBe(678.24);
  });

  it("allows negative potential (warning, not blocked)", () => {
    expect(potentialDays({ label: "Jan", workingDays: 2, holidays: 1, leaves: 2 })).toBe(-1);
  });
});

describe("swag costing seed", () => {
  const rows = seedSwagRows(NOW);

  it("seeds exactly 30 LRP rows in sheet order", () => {
    expect(rows).toHaveLength(30);
    expect(rows.every((r) => r.tab === "lrp")).toBe(true);
    expect(rows.map((r) => r.featureName)).toEqual(sheetExport.swagcosting.rows.map((r) => r[1]));
    expect(rowsForTab(rows, "adhoc")).toEqual([]);
  });

  it("keeps text verbatim, including trailing spaces", () => {
    expect(byName(rows, "Leagues").featureName).toBe("Leagues ");
    expect(byName(rows, "Butterfly").owner).toBe("Aryan");
    expect(byName(rows, "pvp_mode").owner).toBe("Backlog");
  });

  it("leaves blank cells undefined (never 0)", () => {
    const butterfly = byName(rows, "Butterfly");
    expect(butterfly.costs.qa).toEqual({ size: "S(2-5)" });
    expect(butterfly.priority).toBeUndefined();
    const timed = byName(rows, "Timed hint expire + push (Monopoly Go)");
    expect(timed.onePager).toBeUndefined();
    expect("onePager" in timed).toBe(false);
  });

  it("does not store the sheet Total/ROI", () => {
    const row = byName(rows, "Streak Week Strip") as unknown as Record<string, unknown>;
    expect(row.total).toBeUndefined();
    expect(row.roi).toBeUndefined();
  });

  it("parses EO % as a number", () => {
    expect(byName(rows, "Streak Week Strip").eoPercent).toBe(0.46);
    expect(byName(rows, "Mid Puzzle IT post D7").eoPercent).toBe(7.58);
  });

  it("Lucky Hour: seeded by column position, stray M(5-10) not in Priority", () => {
    const lucky = byName(rows, "Lucky Hour");
    expect(lucky.costs.dev).toEqual({ size: "XS(0-2)", days: 2 });
    expect(lucky.costs.qa).toEqual({ size: "XS(0-2)" });
    expect(lucky.priority).toBeUndefined();
    expect(JSON.stringify(lucky)).not.toContain("M(5-10)");
  });
});

describe("swag total and ROI", () => {
  const rows = seedSwagRows(NOW);

  it("Streak Week Strip: total 12, ROI 0.04%", () => {
    const row = byName(rows, "Streak Week Strip");
    expect(swagTotal(row)).toBe(12);
    expect(formatPercent(swagRoi(row))).toBe("0.04%");
    expect(isRowIncomplete(row)).toBe(false);
  });

  it("Daily Reward on D0: total 12, ROI 0.06%", () => {
    const row = byName(rows, "Daily Reward on D0");
    expect(swagTotal(row)).toBe(12);
    expect(formatPercent(swagRoi(row))).toBe("0.06%");
  });

  it("matches the sheet's own Total/ROI cells where they are filled", () => {
    for (const raw of sheetExport.swagcosting.rows) {
      const total = raw[SWAG_COL.total];
      if (!total) continue;
      const row = byName(rows, raw[1].trim());
      expect(String(swagTotal(row))).toBe(total);
      expect(formatPercent(swagRoi(row))).toBe(raw[SWAG_COL.roi]);
    }
  });

  it("incomplete rows: partial total, flagged, missing cells listed", () => {
    const row = byName(rows, "Butterfly");
    expect(swagTotal(row)).toBe(24);
    expect(isRowIncomplete(row)).toBe(true);
    expect(formatPercent(swagRoi(row))).toBe("—");
    expect(missingCellsLabel(row)).toBe("Missing: QA days");
  });

  it("ROI is — when EO or total is blank or 0", () => {
    const costs = { spec: {}, ux: {}, art: {}, ta: {}, dev: {}, qa: {} };
    expect(formatPercent(swagRoi({ costs, eoPercent: 1 }))).toBe("—");
    expect(formatPercent(4)).toBe("4.00%");
    expect(formatPercent(0.7)).toBe("0.70%");
    expect(formatPercent(swagRoi({ costs: { ...costs, dev: { days: 2 } } }))).toBe("—");
    expect(formatPercent(swagRoi({ costs: { ...costs, dev: { days: 0 } }, eoPercent: 1 }))).toBe("—");
    expect(swagTotal({ costs })).toBeUndefined();
  });

  it("size letter", () => {
    expect(sizeLetter("XS(0-2)")).toBe("XS");
    expect(sizeLetter("L(10-15)")).toBe("L");
    expect(sizeLetter("XL")).toBe("XL");
  });
});

describe("gap todos", () => {
  const todos = seedGapTodos(NOW);

  it("creates exactly 7 todos with the required fields", () => {
    expect(todos.map((t) => t.title)).toEqual([
      "Fill missing costing for Lucky Hour — Swag Costing (LRP)",
      "Fill QA days for Two-Act Quotes - Mid-Puzzle Chapter Break — Swag Costing (LRP)",
      "Fill QA days for Butterfly — Swag Costing (LRP)",
      "Fill QA days for Daily Quest variation — Swag Costing (LRP)",
      "Fill QA days for Adaptive Difficulty Opts — Swag Costing (LRP)",
      "Fill QA days for Brilliance boost — Swag Costing (LRP)",
      "Fill QA days for Leagues — Swag Costing (LRP)",
    ]);
    for (const t of todos) {
      expect(t).toMatchObject({ source: "manual", status: "todo", priority: "medium", tags: ["planning"] });
      expect(t.dueDate).toBeUndefined();
      expect(t.owner).toBeUndefined();
    }
  });

  it("Lucky Hour todo mentions the stray M(5-10)", () => {
    expect(todos[0].description).toContain('"M(5-10)"');
    expect(todos[0].description).toContain("QA days are blank");
    expect(todos[2].description).toContain("QA size is set");
  });
});

describe("applyLrp2027Seed", () => {
  it("seeds a store without the keys, once", () => {
    const first = applyLrp2027Seed(baseStore(), NOW);
    expect(first.capacityPlan?.year).toBe(2027);
    expect(first.swagCosting).toHaveLength(30);
    expect(first.tasks).toHaveLength(7);
    const second = applyLrp2027Seed(first, NOW);
    expect(second).toBe(first);
  });

  it("never overwrites existing data", () => {
    const capacityPlan = { ...seedCapacityPlan(NOW), year: 2030 };
    const store = baseStore({ capacityPlan, swagCosting: [] });
    expect(applyLrp2027Seed(store, NOW)).toBe(store);
  });

  it("does not duplicate todos that already exist", () => {
    const todos = seedGapTodos(NOW);
    const store = baseStore({ tasks: [{ ...todos[1], status: "done" }] });
    const seeded = applyLrp2027Seed(store, NOW);
    expect(seeded.tasks).toHaveLength(7);
    expect(seeded.tasks.filter((t) => t.title === todos[1].title)).toHaveLength(1);
    expect(seeded.tasks[0].status).toBe("done");
  });
});

describe("moveSwagRow", () => {
  const rows = seedSwagRows(NOW);

  it("moves to the end of the other tab and back to the original position", () => {
    const id = rows[2].id;
    const moved = moveSwagRow(rows, id, "adhoc", undefined, NOW)!;
    expect(rowsForTab(moved, "adhoc").map((r) => r.id)).toEqual([id]);
    expect(rowsForTab(moved, "lrp")).toHaveLength(29);

    const back = moveSwagRow(moved, id, "lrp", 2, NOW)!;
    expect(rowsForTab(back, "lrp").map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(indexInTab(back, id)).toBe(2);
  });

  it("returns null for an unknown id", () => {
    expect(moveSwagRow(rows, "nope", "adhoc")).toBeNull();
  });
});

describe("input parsing", () => {
  it("blank is missing, negative is rejected, decimals allowed", () => {
    expect(parseNonNegative("")).toEqual({ ok: true, value: undefined });
    expect(parseNonNegative("2.41")).toEqual({ ok: true, value: 2.41 });
    expect(parseNonNegative("-1")).toEqual({ ok: false, error: "Must be 0 or more." });
    expect(parseNonNegative("abc").ok).toBe(false);
    expect(parseEoPercent("0.46%")).toEqual({ ok: true, value: 0.46 });
  });
});
