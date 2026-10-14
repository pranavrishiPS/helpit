import { historyReducer, initHistory, type DraftHistory } from "./draft-history";
import { HEADCOUNT_KEYS, potentialDays, round2 } from "./lrp-2027";
import type { CapacityHeadcount, CapacityMonth, CapacityPlan } from "./types";

// Capacity Plan v2 draft model (docs/specs/planning-2027.md §9.2): every edit changes a local
// draft with undo/redo; nothing is sent until Save, which sends one patch of the differences.

export type MonthField = "workingDays" | "holidays" | "leaves";

export type CapacityEdit =
  | { kind: "year"; value: number }
  | { kind: "headcount"; key: keyof CapacityHeadcount; value: number }
  | { kind: "month"; index: number; field: MonthField; value: number };

export type CapacityDraftState = DraftHistory<CapacityPlan>;

export type CapacityDraftAction =
  | { type: "edit"; edit: CapacityEdit }
  | { type: "undo" }
  | { type: "redo" }
  /** Discard the draft, or take a fresh server plan (Reload / after Save). Clears history. */
  | { type: "reset"; plan: CapacityPlan };

export function initDraft(plan: CapacityPlan): CapacityDraftState {
  return initHistory(plan);
}

export function applyEdit(plan: CapacityPlan, edit: CapacityEdit): CapacityPlan {
  switch (edit.kind) {
    case "year":
      return plan.year === edit.value ? plan : { ...plan, year: edit.value };
    case "headcount":
      return plan.headcount[edit.key] === edit.value
        ? plan
        : { ...plan, headcount: { ...plan.headcount, [edit.key]: edit.value } };
    case "month": {
      const month = plan.months[edit.index];
      if (!month || month[edit.field] === edit.value) return plan;
      const months = plan.months.map((m, i) => (i === edit.index ? { ...m, [edit.field]: edit.value } : m));
      return { ...plan, months };
    }
  }
}

export function capacityDraftReducer(
  state: CapacityDraftState,
  action: CapacityDraftAction
): CapacityDraftState {
  switch (action.type) {
    case "edit":
      return historyReducer(state, { type: "set", draft: applyEdit(state.draft, action.edit) });
    case "reset":
      return historyReducer(state, { type: "reset", value: action.plan });
    default:
      return historyReducer(state, action);
  }
}

/** Field keys that differ between the saved plan and the draft ("year", "headcount.dev", "month.0.holidays"). */
export function changedFields(saved: CapacityPlan, draft: CapacityPlan): string[] {
  const out: string[] = [];
  if (saved.year !== draft.year) out.push("year");
  for (const key of HEADCOUNT_KEYS) {
    if (saved.headcount[key] !== draft.headcount[key]) out.push(`headcount.${key}`);
  }
  draft.months.forEach((m, i) => {
    const before = saved.months[i];
    for (const field of ["workingDays", "holidays", "leaves"] as const) {
      if (!before || before[field] !== m[field]) out.push(`month.${i}.${field}`);
    }
  });
  return out;
}

export interface CapacityPatch {
  year?: number;
  headcount?: Partial<CapacityHeadcount>;
  months?: ({ index: number } & Partial<Pick<CapacityMonth, MonthField>>)[];
}

/** One Save patch with only the changed values; null when there is nothing to save. */
export function draftPatch(saved: CapacityPlan, draft: CapacityPlan): CapacityPatch | null {
  const patch: CapacityPatch = {};
  if (saved.year !== draft.year) patch.year = draft.year;
  for (const key of HEADCOUNT_KEYS) {
    if (saved.headcount[key] !== draft.headcount[key]) {
      patch.headcount = { ...patch.headcount, [key]: draft.headcount[key] };
    }
  }
  draft.months.forEach((m, i) => {
    const before = saved.months[i];
    const entry: { index: number } & Partial<Pick<CapacityMonth, MonthField>> = { index: i };
    let changed = false;
    for (const field of ["workingDays", "holidays", "leaves"] as const) {
      if (!before || before[field] !== m[field]) {
        entry[field] = m[field];
        changed = true;
      }
    }
    if (changed) patch.months = [...(patch.months ?? []), entry];
  });
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Same user-entered values (ignores updatedAt, which a Blob in-memory seed refreshes per read). */
export function samePlanValues(a: CapacityPlan | undefined, b: CapacityPlan | undefined): boolean {
  if (!a || !b) return a === b;
  return changedFields(a, b).length === 0 && a.months.length === b.months.length;
}

/** Average potential days per month (rounded to 2 decimals). */
export function averagePotential(months: CapacityMonth[]): number {
  if (months.length === 0) return 0;
  return round2(months.reduce((sum, m) => sum + potentialDays(m), 0) / months.length);
}

/** Thin month = potential days at least 10% below the 12-month average. Returns month indexes. */
export function thinMonths(months: CapacityMonth[]): number[] {
  if (months.length === 0) return [];
  const avg = months.reduce((sum, m) => sum + potentialDays(m), 0) / months.length;
  if (avg <= 0) return [];
  const threshold = avg * 0.9;
  const out: number[] = [];
  months.forEach((m, i) => {
    // Small tolerance so a month exactly 10% below still counts despite float noise.
    if (potentialDays(m) <= threshold + 1e-9) out.push(i);
  });
  return out;
}
