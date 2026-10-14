import sheetExport from "../../docs/specs/data/lrp-2027-sheet-export.json";
import { SWAG_FUNCTIONS, SWAG_FUNCTION_LABELS } from "./lrp-2027";
import type {
  CapacityPlan,
  DashboardStore,
  SwagCost,
  SwagCostingRow,
  SwagFunction,
  Task,
} from "./types";

// One-time seed for 2027 Planning from the verbatim Google Sheet export
// (docs/specs/planning-2027.md §6). Values are read by column position; blank cells stay
// undefined and nothing is invented. Known gaps become todos on the Tasks tab instead.

export interface LrpSheetExport {
  capacityPlan: {
    year: number;
    headcount: Record<string, number>;
    months: (string | number)[][];
  };
  swagcosting: {
    header: string[];
    rows: string[][];
  };
}

/** Swag Costing columns by position (see the export's `header`). */
export const SWAG_COL = {
  owner: 0,
  featureName: 1,
  onePager: 2,
  eo: 3,
  /** size column per function; days is size + 1. */
  sizes: { spec: 4, ux: 6, art: 8, ta: 10, dev: 12, qa: 14 } as Record<SwagFunction, number>,
  total: 16,
  roi: 17,
  priority: 18,
} as const;

/** Headcount keys in the export → store keys. */
const HEADCOUNT_SOURCE = {
  product: "Product",
  design: "Design",
  ux: "UX",
  uiArt: "UI/Art",
  animUi: "Anim+UI Integration",
  dev: "Dev",
  qa: "QA",
} as const;

export const LRP_SEED_ROW_ID_PREFIX = "lrp2027-swag-";
export const LRP_GAP_TODO_ID_PREFIX = "lrp2027-gap-";

const DEFAULT_EXPORT = sheetExport as unknown as LrpSheetExport;

function cell(row: string[], index: number): string | undefined {
  const value = row[index];
  if (value == null) return undefined;
  return String(value).trim() === "" ? undefined : String(value);
}

function numberCell(row: string[], index: number): number | undefined {
  const value = cell(row, index);
  if (value == null) return undefined;
  const n = Number(value.trim().replace(/%$/, ""));
  return Number.isFinite(n) ? n : undefined;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function seedCapacityPlan(now: string, data: LrpSheetExport = DEFAULT_EXPORT): CapacityPlan {
  const src = data.capacityPlan;
  const headcount = {} as CapacityPlan["headcount"];
  for (const [key, sourceKey] of Object.entries(HEADCOUNT_SOURCE)) {
    headcount[key as keyof CapacityPlan["headcount"]] = Number(src.headcount[sourceKey]);
  }
  return {
    year: src.year,
    headcount,
    // [Month, Working Calendar days, Holidays, Tentative Leaves]
    months: src.months.map((m) => ({
      label: String(m[0]),
      workingDays: Number(m[1]),
      holidays: Number(m[2]),
      leaves: Number(m[3]),
    })),
    updatedAt: now,
  };
}

export function seedSwagRows(now: string, data: LrpSheetExport = DEFAULT_EXPORT): SwagCostingRow[] {
  return data.swagcosting.rows.map((row, i) => {
    const costs = {} as Record<SwagFunction, SwagCost>;
    for (const fn of SWAG_FUNCTIONS) {
      const sizeCol = SWAG_COL.sizes[fn];
      const cost: SwagCost = {};
      const size = cell(row, sizeCol);
      const days = numberCell(row, sizeCol + 1);
      if (size !== undefined) cost.size = size;
      if (days !== undefined) cost.days = days;
      costs[fn] = cost;
    }
    const seeded: SwagCostingRow = {
      id: `${LRP_SEED_ROW_ID_PREFIX}${String(i + 1).padStart(2, "0")}`,
      tab: "lrp",
      order: i,
      featureName: row[SWAG_COL.featureName] ?? "",
      costs,
      createdAt: now,
      updatedAt: now,
    };
    const owner = cell(row, SWAG_COL.owner);
    const onePager = cell(row, SWAG_COL.onePager);
    const eo = numberCell(row, SWAG_COL.eo);
    const priority = cell(row, SWAG_COL.priority);
    if (owner !== undefined) seeded.owner = owner;
    if (onePager !== undefined) seeded.onePager = onePager;
    if (eo !== undefined) seeded.eoPercent = eo;
    if (priority !== undefined) seeded.priority = priority;
    return seeded;
  });
}

/** One todo per sheet row with blank day cells or stray values outside the known columns. */
export function seedGapTodos(now: string, data: LrpSheetExport = DEFAULT_EXPORT): Task[] {
  const todos: Task[] = [];
  data.swagcosting.rows.forEach((row, i) => {
    const name = (row[SWAG_COL.featureName] ?? "").trim();
    const owner = cell(row, SWAG_COL.owner);
    const missing = SWAG_FUNCTIONS.filter((fn) => cell(row, SWAG_COL.sizes[fn] + 1) === undefined);
    const stray = row
      .map((value, index) => ({ value, index }))
      .filter(({ value, index }) => index > SWAG_COL.priority && String(value ?? "").trim() !== "");
    if (missing.length === 0 && stray.length === 0) return;

    const where = `"${name}"${owner ? ` (owner: ${owner})` : ""} in Swag Costing (LRP)`;
    const gapLines = missing.map((fn) => {
      const label = SWAG_FUNCTION_LABELS[fn].short;
      const size = cell(row, SWAG_COL.sizes[fn]);
      return size
        ? `${label} size is set (${size}) but ${label} days are blank in the sheet.`
        : `${label} size and ${label} days are blank in the sheet.`;
    });

    let title: string;
    let description: string;
    if (stray.length > 0) {
      title = `Fill missing costing for ${name} — Swag Costing (LRP)`;
      const lines = [...gapLines];
      if (cell(row, SWAG_COL.priority) === undefined) lines.push("Priority is blank in the sheet.");
      for (const { value, index } of stray) {
        const offset = index - SWAG_COL.priority;
        lines.push(
          `The sheet has "${value}" in an unlabeled column ${offset === 1 ? "one column" : `${offset} columns`} right of Priority (column ${columnLetter(index)}). It was not imported: decide whether it is the Priority or a misplaced size, then fill it in.`
        );
      }
      description = `${where}. Gaps: ${lines.join(" ")}`;
    } else {
      const labels = missing.map((fn) => SWAG_FUNCTION_LABELS[fn].short);
      title = `Fill ${labels.join(", ")} days for ${name} — Swag Costing (LRP)`;
      description = `${where}: ${gapLines.join(" ")} Total and ROI stay partial until it is filled.`;
    }

    todos.push({
      id: `${LRP_GAP_TODO_ID_PREFIX}${String(i + 1).padStart(2, "0")}`,
      title,
      description,
      status: "todo",
      priority: "medium",
      source: "manual",
      tags: ["planning"],
      createdAt: now,
      updatedAt: now,
    });
  });
  return todos;
}

/**
 * Seeds `capacityPlan` / `swagCosting` only when the key is missing, and adds the gap todos
 * together with the Swag rows (once). Existing data is never overwritten and todos are never
 * duplicated (matched by id and title). Returns the same object when there is nothing to seed.
 */
export function applyLrp2027Seed(
  store: DashboardStore,
  now: string = new Date().toISOString(),
  data: LrpSheetExport = DEFAULT_EXPORT
): DashboardStore {
  let next = store;
  if (store.capacityPlan === undefined) {
    next = { ...next, capacityPlan: seedCapacityPlan(now, data) };
  }
  if (store.swagCosting === undefined) {
    const tasks = next.tasks ?? [];
    const ids = new Set(tasks.map((t) => t.id));
    const titles = new Set(tasks.map((t) => t.title));
    const todos = seedGapTodos(now, data).filter((t) => !ids.has(t.id) && !titles.has(t.title));
    next = { ...next, swagCosting: seedSwagRows(now, data), tasks: [...tasks, ...todos] };
  }
  return next;
}
