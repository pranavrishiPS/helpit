import { historyReducer, initHistory, type DraftHistory, type DraftHistoryAction } from "./draft-history";
import { SWAG_FUNCTIONS, moveSwagRow, nextOrder } from "./lrp-2027";
import type { SwagCost, SwagCostingRow, SwagFunction, SwagTab } from "./types";

// Swag Costing draft model: every edit (cells, add, delete, move between tabs) changes a local
// copy of ALL rows (both tabs) with undo/redo; Save sends one bulk request with the differences.

/** Field patch for a row. `null` or blank clears a field (blank = missing, never 0). */
export interface SwagRowPatch {
  featureName?: string;
  owner?: string | null;
  onePager?: string | null;
  eoPercent?: number | null;
  priority?: string | null;
  costs?: Partial<Record<SwagFunction, { size?: string | null; days?: number | null }>>;
}

export type SwagEdit =
  | { kind: "patch"; id: string; patch: SwagRowPatch }
  | { kind: "add"; row: SwagCostingRow }
  | { kind: "delete"; id: string }
  /** To the end of `tab`, or to `index` in it. */
  | { kind: "move"; id: string; tab: SwagTab; index?: number };

export type SwagDraftState = DraftHistory<SwagCostingRow[]>;

export type SwagDraftAction =
  | { type: "edit"; edit: SwagEdit }
  | Exclude<DraftHistoryAction<SwagCostingRow[]>, { type: "set" }>;

export function initSwagDraft(rows: SwagCostingRow[]): SwagDraftState {
  return initHistory(rows);
}

/** Applies a patch to one row with the same rules as the API (blank/null clears). */
export function applySwagRowPatch(row: SwagCostingRow, patch: SwagRowPatch): SwagCostingRow {
  const next: SwagCostingRow = { ...row, costs: { ...row.costs } };
  if (patch.featureName !== undefined) next.featureName = patch.featureName;
  for (const key of ["owner", "onePager", "priority"] as const) {
    if (patch[key] === undefined) continue;
    const value = patch[key];
    if (value == null || value.trim() === "") delete next[key];
    else next[key] = value;
  }
  if (patch.eoPercent !== undefined) {
    if (patch.eoPercent === null) delete next.eoPercent;
    else next.eoPercent = patch.eoPercent;
  }
  for (const fn of SWAG_FUNCTIONS) {
    const p = patch.costs?.[fn];
    if (!p) continue;
    const cost: SwagCost = { ...next.costs[fn] };
    if (p.size !== undefined) {
      if (p.size == null || p.size.trim() === "") delete cost.size;
      else cost.size = p.size.trim();
    }
    if (p.days !== undefined) {
      if (p.days === null) delete cost.days;
      else cost.days = p.days;
    }
    next.costs[fn] = cost;
  }
  return sameRowValues(row, next) ? row : next;
}

/** Returns the same array when the edit changes nothing (so it adds no undo step). */
export function applySwagEdit(rows: SwagCostingRow[], edit: SwagEdit): SwagCostingRow[] {
  switch (edit.kind) {
    case "patch": {
      const index = rows.findIndex((r) => r.id === edit.id);
      if (index === -1) return rows;
      const updated = applySwagRowPatch(rows[index], edit.patch);
      if (updated === rows[index]) return rows;
      const next = [...rows];
      next[index] = updated;
      return next;
    }
    case "add":
      if (rows.some((r) => r.id === edit.row.id)) return rows;
      return [...rows, { ...edit.row, order: nextOrder(rows, edit.row.tab) }];
    case "delete":
      return rows.some((r) => r.id === edit.id) ? rows.filter((r) => r.id !== edit.id) : rows;
    case "move": {
      const row = rows.find((r) => r.id === edit.id);
      if (!row || (row.tab === edit.tab && edit.index === undefined)) return rows;
      // Keep timestamps as they are: the server sets updatedAt on Save.
      return moveSwagRow(rows, edit.id, edit.tab, edit.index, row.updatedAt) ?? rows;
    }
  }
}

export function swagDraftReducer(state: SwagDraftState, action: SwagDraftAction): SwagDraftState {
  if (action.type === "edit") {
    return historyReducer(state, { type: "set", draft: applySwagEdit(state.draft, action.edit) });
  }
  return historyReducer(state, action);
}

/* ------------------------------------------------------------------ */
/* Diffing                                                             */
/* ------------------------------------------------------------------ */

/** User-visible fields compared for "changed" marks. Order is not counted (moves count via tab). */
export function rowFieldKeys(): string[] {
  return ["featureName", "owner", "onePager", "eoPercent", "priority", "tab", ...SWAG_FUNCTIONS.map((fn) => `cost-${fn}`)];
}

function fieldValue(row: SwagCostingRow, key: string): unknown {
  if (key.startsWith("cost-")) {
    const cost = row.costs[key.slice(5) as SwagFunction] ?? {};
    return `${cost.size ?? ""}|${cost.days ?? ""}`;
  }
  return (row as unknown as Record<string, unknown>)[key];
}

function sameRowValues(a: SwagCostingRow, b: SwagCostingRow): boolean {
  return a.order === b.order && rowFieldKeys().every((k) => fieldValue(a, k) === fieldValue(b, k));
}

export interface SwagChanges {
  /** "<rowId>:<field>" for changed cells of existing rows, and every field of added rows. */
  cells: Set<string>;
  added: Set<string>;
  deleted: string[];
  /** Changed fields + added rows + deleted rows (what "Unsaved changes (n)" shows). */
  count: number;
}

export function swagChanges(saved: SwagCostingRow[], draft: SwagCostingRow[]): SwagChanges {
  const before = new Map(saved.map((r) => [r.id, r]));
  const after = new Set(draft.map((r) => r.id));
  const cells = new Set<string>();
  const added = new Set<string>();
  let count = 0;
  for (const row of draft) {
    const old = before.get(row.id);
    if (!old) {
      added.add(row.id);
      for (const k of rowFieldKeys()) cells.add(`${row.id}:${k}`);
      count++;
      continue;
    }
    for (const k of rowFieldKeys()) {
      if (fieldValue(old, k) !== fieldValue(row, k)) {
        cells.add(`${row.id}:${k}`);
        count++;
      }
    }
  }
  const deleted = saved.filter((r) => !after.has(r.id)).map((r) => r.id);
  return { cells, added, deleted, count: count + deleted.length };
}

/** Row as sent to the bulk save (timestamps are set by the server). */
export type SwagRowUpsert = Omit<SwagCostingRow, "createdAt" | "updatedAt">;

export interface SwagSavePayload {
  upserts: SwagRowUpsert[];
  deletes: string[];
}

/** One bulk payload: added/changed/reordered rows in full, plus deleted ids. Null = nothing to save. */
export function swagSavePayload(saved: SwagCostingRow[], draft: SwagCostingRow[]): SwagSavePayload | null {
  const before = new Map(saved.map((r) => [r.id, r]));
  const upserts: SwagRowUpsert[] = [];
  for (const row of draft) {
    const old = before.get(row.id);
    if (old && sameRowValues(old, row)) continue;
    const { createdAt, updatedAt, ...rest } = row;
    void createdAt;
    void updatedAt;
    upserts.push(rest);
  }
  const ids = new Set(draft.map((r) => r.id));
  const deletes = saved.filter((r) => !ids.has(r.id)).map((r) => r.id);
  return upserts.length || deletes.length ? { upserts, deletes } : null;
}

/** Same rows and values, ignoring timestamps (a Blob in-memory seed refreshes them per read). */
export function sameSwagRows(a: SwagCostingRow[], b: SwagCostingRow[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((r) => [r.id, r]));
  return a.every((r) => {
    const other = byId.get(r.id);
    return Boolean(other) && sameRowValues(r, other!);
  });
}
