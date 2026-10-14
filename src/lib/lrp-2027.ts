import type {
  CapacityHeadcount,
  CapacityMonth,
  CapacityPlan,
  SwagCostingRow,
  SwagFunction,
  SwagTab,
} from "./types";

// 2027 Planning (docs/specs/planning-2027.md). Pure calc helpers shared by the API and UI.
// Computed values (potential, mandays, totals, Swag Total/ROI) are never stored.

export const HEADCOUNT_KEYS = ["product", "design", "ux", "uiArt", "animUi", "dev", "qa"] as const;

export const HEADCOUNT_LABELS: Record<keyof CapacityHeadcount, string> = {
  product: "Product",
  design: "Design",
  ux: "UX",
  uiArt: "UI/Art",
  animUi: "Anim+UI Integration",
  dev: "Dev",
  qa: "QA",
};

/** Short labels for the mandays columns and the headcount strip. */
export const HEADCOUNT_SHORT_LABELS: Record<keyof CapacityHeadcount, string> = {
  product: "Product",
  design: "Design",
  ux: "UX",
  uiArt: "UI/Art",
  animUi: "Anim+UI",
  dev: "Dev",
  qa: "QA",
};

export const SWAG_FUNCTIONS: readonly SwagFunction[] = ["spec", "ux", "art", "ta", "dev", "qa"];

export const SWAG_FUNCTION_LABELS: Record<SwagFunction, { short: string; full: string }> = {
  spec: { short: "Spec", full: "Spec Costing" },
  ux: { short: "UX", full: "UX Costing" },
  art: { short: "Art", full: "Art Costing" },
  ta: { short: "TA", full: "TA Costing" },
  dev: { short: "Dev", full: "Dev Costing" },
  qa: { short: "QA", full: "QA Costing" },
};

/** The sizes present in the sheet. Other text is accepted and shown as-is. */
export const T_SHIRT_SIZES = ["XS(0-2)", "S(2-5)", "M(5-10)", "L(10-15)"] as const;

export const SWAG_TAB_LABELS: Record<SwagTab, string> = { lrp: "LRP", adhoc: "Adhoc" };

/** Owner picker: TEAM.md roster plus "Backlog" (spec §6). No other people. */
export const LRP_OWNER_OPTIONS = [
  "Anup G",
  "Amit Kumar Srivastava",
  "Pranav Rishi",
  "Vrushali Patil",
  "Sanyogita Jadhav",
  "Aryan Kulkarni",
  "Althmash Shaikh",
  "Nalini S",
  "Gunjan Kamboj",
  "Pratyush Aryan",
  "Mangesh",
  "Rohan Karir",
  "Manvi Thakur",
  "Yogit Malethia",
  "Uttam Katiyar",
  "Ayush Upadhyay",
  "Backlog",
] as const;

/** Rounds away float noise (2.41 × 12) for display and comparison. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatNumber(n: number): string {
  return String(round2(n));
}

/* ------------------------------------------------------------------ */
/* Capacity Plan                                                       */
/* ------------------------------------------------------------------ */

export function potentialDays(month: CapacityMonth): number {
  return month.workingDays - month.holidays - month.leaves;
}

export function monthMandays(
  month: CapacityMonth,
  headcount: CapacityHeadcount
): Record<keyof CapacityHeadcount, number> {
  const potential = potentialDays(month);
  const out = {} as Record<keyof CapacityHeadcount, number>;
  for (const key of HEADCOUNT_KEYS) out[key] = potential * headcount[key];
  return out;
}

export interface CapacityTotals extends Record<keyof CapacityHeadcount, number> {
  workingDays: number;
  holidays: number;
  leaves: number;
  potentialDays: number;
}

/** Column sums for the Total row (rounded to 2 decimals). */
export function capacityTotals(plan: Pick<CapacityPlan, "months" | "headcount">): CapacityTotals {
  const totals: CapacityTotals = {
    workingDays: 0,
    holidays: 0,
    leaves: 0,
    potentialDays: 0,
    product: 0,
    design: 0,
    ux: 0,
    uiArt: 0,
    animUi: 0,
    dev: 0,
    qa: 0,
  };
  for (const month of plan.months) {
    totals.workingDays += month.workingDays;
    totals.holidays += month.holidays;
    totals.leaves += month.leaves;
    totals.potentialDays += potentialDays(month);
    const mandays = monthMandays(month, plan.headcount);
    for (const key of HEADCOUNT_KEYS) totals[key] += mandays[key];
  }
  for (const key of Object.keys(totals) as (keyof CapacityTotals)[]) {
    totals[key] = round2(totals[key]);
  }
  return totals;
}

/* ------------------------------------------------------------------ */
/* Swag Costing                                                        */
/* ------------------------------------------------------------------ */

/** Functions whose day cell is blank (missing, not 0). */
export function missingDayFunctions(row: Pick<SwagCostingRow, "costs">): SwagFunction[] {
  return SWAG_FUNCTIONS.filter((fn) => row.costs[fn]?.days == null);
}

export function isRowIncomplete(row: Pick<SwagCostingRow, "costs">): boolean {
  return missingDayFunctions(row).length > 0;
}

/** e.g. "Missing: QA days" — used for the tooltip and screen readers. */
export function missingCellsLabel(row: Pick<SwagCostingRow, "costs">): string {
  const missing = missingDayFunctions(row);
  if (missing.length === 0) return "";
  return `Missing: ${missing.map((fn) => `${SWAG_FUNCTION_LABELS[fn].short} days`).join(", ")}`;
}

/** Sum of the filled day cells (partial when the row is incomplete). Undefined when none are filled. */
export function swagTotal(row: Pick<SwagCostingRow, "costs">): number | undefined {
  let total: number | undefined;
  for (const fn of SWAG_FUNCTIONS) {
    const days = row.costs[fn]?.days;
    if (days != null) total = (total ?? 0) + days;
  }
  return total == null ? undefined : round2(total);
}

/**
 * ROI = EO% / Total, as a percent number. Undefined ("—") when EO or Total is blank or 0, or when
 * the row is incomplete (a partial Total would overstate ROI).
 */
export function swagRoi(row: Pick<SwagCostingRow, "costs" | "eoPercent">): number | undefined {
  const total = swagTotal(row);
  if (!row.eoPercent || !total || isRowIncomplete(row)) return undefined;
  return row.eoPercent / total;
}

/** "0.04%" or "—". */
export function formatPercent(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

/** "XS(0-2)" → "XS"; free text stays as typed. */
export function sizeLetter(size: string): string {
  const match = /^([A-Za-z]+)\s*\(/.exec(size.trim());
  return match ? match[1] : size.trim();
}

/** Rows of one tab in display order. */
export function rowsForTab(rows: SwagCostingRow[], tab: SwagTab): SwagCostingRow[] {
  return rows.filter((r) => r.tab === tab).sort((a, b) => a.order - b.order);
}

export function nextOrder(rows: SwagCostingRow[], tab: SwagTab): number {
  return rows.reduce((max, r) => (r.tab === tab ? Math.max(max, r.order + 1) : max), 0);
}

/**
 * Moves a row to `tab`. Without `index` it goes to the end; with `index` it is inserted at that
 * position (Undo restores the original spot). Orders in the target tab are renumbered 0..n-1.
 * Returns null when the id is unknown.
 */
export function moveSwagRow(
  rows: SwagCostingRow[],
  id: string,
  tab: SwagTab,
  index?: number,
  now: string = new Date().toISOString()
): SwagCostingRow[] | null {
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const target = rowsForTab(rows, tab).filter((r) => r.id !== id);
  const at = index == null ? target.length : Math.max(0, Math.min(index, target.length));
  const moved = { ...row, tab, updatedAt: row.tab === tab && index == null ? row.updatedAt : now };
  target.splice(at, 0, moved);
  const newOrder = new Map(target.map((r, i) => [r.id, i]));
  return rows.map((r) => {
    if (r.id === id) return { ...moved, order: newOrder.get(id)! };
    const order = newOrder.get(r.id);
    return order == null || order === r.order ? r : { ...r, order };
  });
}

/** Position of a row inside its tab (for Undo). */
export function indexInTab(rows: SwagCostingRow[], id: string): number {
  const row = rows.find((r) => r.id === id);
  if (!row) return -1;
  return rowsForTab(rows, row.tab).findIndex((r) => r.id === id);
}

export function emptyCosts(): Record<SwagFunction, { size?: string; days?: number }> {
  return { spec: {}, ux: {}, art: {}, ta: {}, dev: {}, qa: {} };
}

/** http(s) URL check for the 1-pager cell; anything else renders as plain text. */
export function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Parses a numeric cell input. Blank → undefined (missing, not 0).
 * Negative or non-numeric → error message (the value is not saved).
 */
export function parseNonNegative(
  input: string
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a number." };
  if (value < 0) return { ok: false, error: "Must be 0 or more." };
  return { ok: true, value };
}

/** Parses an EO cell: "0.46%" or "0.46" → 0.46. */
export function parseEoPercent(
  input: string
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  return parseNonNegative(input.trim().replace(/%$/, ""));
}
