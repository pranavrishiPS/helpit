import type { RecurringCadence, RecurringMonthlyMode, RecurringTask, RecurringWeekOfMonth } from "./types";
import {
  cleanRuleFields,
  type RecurringRuleFields,
  type RecurringRulePatch,
} from "./recurrence";

/** Form state for the Recurring panel: text inputs stay strings until they are submitted. */
export interface RuleDraft {
  /** Set when editing an existing rule. */
  id?: string;
  title: string;
  comment: string;
  cadence: RecurringCadence;
  weekdays: number[];
  monthlyMode: RecurringMonthlyMode;
  weekOfMonth: RecurringWeekOfMonth;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
}

/** Defaults on New: Daily, starts today, no end. Monthly defaults to "On week", 1st. */
export function newDraft(today: string): RuleDraft {
  return {
    title: "",
    comment: "",
    cadence: "daily",
    weekdays: [],
    monthlyMode: "weekday_of_month",
    weekOfMonth: 1,
    dayOfMonth: "",
    startDate: today,
    endDate: "",
  };
}

export function draftFromRule(rule: RecurringTask): RuleDraft {
  return {
    id: rule.id,
    title: rule.title,
    comment: rule.comment ?? "",
    cadence: rule.cadence,
    weekdays: [...(rule.weekdays ?? [])],
    monthlyMode: rule.monthlyMode ?? "weekday_of_month",
    weekOfMonth: rule.weekOfMonth ?? 1,
    dayOfMonth: rule.dayOfMonth === undefined ? "" : String(rule.dayOfMonth),
    startDate: rule.startDate,
    endDate: rule.endDate ?? "",
  };
}

/** Rule fields from a draft (not trimmed or validated: pair with `validateRule`). */
export function draftToFields(draft: RuleDraft): RecurringRuleFields {
  const day = draft.dayOfMonth.trim();
  return {
    title: draft.title,
    comment: draft.comment,
    cadence: draft.cadence,
    weekdays: draft.weekdays,
    monthlyMode: draft.monthlyMode,
    weekOfMonth: draft.weekOfMonth,
    dayOfMonth: day === "" ? undefined : Number(day),
    startDate: draft.startDate,
    endDate: draft.endDate || undefined,
  };
}

/** PATCH body for an edit: every field is sent, cleared optionals as null. */
export function draftToPatch(draft: RuleDraft): RecurringRulePatch {
  const fields = cleanRuleFields(draftToFields(draft));
  return { ...fields, comment: fields.comment ?? null, endDate: fields.endDate ?? null };
}

/** Toggles a weekday in a selection; the result is sorted. */
export function toggleWeekday(selected: readonly number[], day: number): number[] {
  const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day];
  return next.sort((a, b) => a - b);
}
