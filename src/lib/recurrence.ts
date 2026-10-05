import { v4 as uuidv4 } from "uuid";
import type {
  DashboardStore,
  RecurringCadence,
  RecurringMonthlyMode,
  RecurringTask,
  RecurringWeekOfMonth,
  Task,
} from "./types";
import { isDayKey, shiftDayKey, taskDay } from "./task-board";

// Pure helpers for recurring tasks (docs/specs/recurring-tasks.md §5). Nothing here reads the
// clock: callers pass the client's local `today` (yyyy-MM-dd) and an ISO `now` for timestamps.
// Day stepping goes through `shiftDayKey` (calendar components), never millisecond arithmetic,
// so a 23h/25h DST day can't skip or double a date.

/** Days after today for which rows are already created (tomorrow shows in Upcoming). */
export const LOOKAHEAD_DAYS = 1;
/** Missed past days are never created. */
export const CATCHUP_DAYS = 0;
export const MAX_RECURRING_RULES = 100;
export const MAX_TITLE_LENGTH = 500;
export const MAX_COMMENT_LENGTH = 5000;
/** nextOccurrence gives up after this many days (longest real gap is about 2 months). */
const NEXT_SEARCH_LIMIT_DAYS = 800;

/** Mon..Fri, Sun = 0. */
export const WEEKDAY_PRESET: readonly number[] = [1, 2, 3, 4, 5];
/** Display order of the weekday toggles: Monday first, Sunday last. */
export const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const WEEK_OF_MONTH_LABELS: Record<string, string> = {
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  last: "Last",
};

export const RECURRING_CAP_MESSAGE =
  "You have reached 100 recurring tasks. Delete one to add more.";

/** The user-editable part of a rule. */
export interface RecurringRuleFields {
  title: string;
  comment?: string;
  cadence: RecurringCadence;
  weekdays?: number[];
  monthlyMode?: RecurringMonthlyMode;
  weekOfMonth?: RecurringWeekOfMonth;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
}

/** Partial update: `null` clears an optional field, `undefined` leaves it alone. */
export type RecurringRulePatch = {
  [K in keyof RecurringRuleFields]?: RecurringRuleFields[K] | null;
} & { active?: boolean };

export type RuleErrorField =
  | "title"
  | "comment"
  | "cadence"
  | "startDate"
  | "endDate"
  | "weekdays"
  | "monthlyMode"
  | "weekOfMonth"
  | "dayOfMonth";
export type RuleErrors = Partial<Record<RuleErrorField, string>>;

/* ------------------------------------------------------------------ */
/* Calendar helpers                                                    */
/* ------------------------------------------------------------------ */

function parseKey(key: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Local calendar components built at noon, so no DST shift can change the date. */
function localNoon(y: number, month: number, d: number): Date {
  return new Date(y, month - 1, d, 12);
}

/** True for a well-formed key that is a real calendar date (rejects 2026-02-30). */
export function isRealDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !isDayKey(value)) return false;
  const [y, m, d] = parseKey(value)!;
  const date = localNoon(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** 0 (Sun) to 6 (Sat). */
export function weekdayOf(dayKey: string): number {
  const [y, m, d] = parseKey(dayKey)!;
  return localNoon(y, m, d).getDay();
}

export function daysInMonthOf(dayKey: string): number {
  const [y, m] = parseKey(dayKey)!;
  return localNoon(y, m + 1, 0).getDate(); // day 0 of next month = last day of this one
}

function maxKey(a: string, b: string): string {
  return a >= b ? a : b;
}
function minKey(a: string, b: string): string {
  return a <= b ? a : b;
}

/* ------------------------------------------------------------------ */
/* Validation and normalisation                                        */
/* ------------------------------------------------------------------ */

function validWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<number>();
  for (const v of value) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

function validWeekOfMonth(value: unknown): value is RecurringWeekOfMonth {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === "last";
}

/** Field errors for a rule (empty object = valid). Messages are the form's wording. */
export function validateRule(rule: Partial<RecurringRuleFields>): RuleErrors {
  const errors: RuleErrors = {};
  const title = typeof rule.title === "string" ? rule.title.trim() : "";
  if (!title) errors.title = "Title required";
  else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title can't be longer than ${MAX_TITLE_LENGTH} characters`;
  }
  if (typeof rule.comment === "string" && rule.comment.trim().length > MAX_COMMENT_LENGTH) {
    errors.comment = `Comment can't be longer than ${MAX_COMMENT_LENGTH} characters`;
  }

  if (!isRealDayKey(rule.startDate)) errors.startDate = "Start date is required";
  if (rule.endDate !== undefined && rule.endDate !== "") {
    if (!isRealDayKey(rule.endDate)) errors.endDate = "End date is not a valid date";
    else if (isRealDayKey(rule.startDate) && rule.endDate < rule.startDate) {
      errors.endDate = "End date can't be before start date";
    }
  }

  const days = validWeekdays(rule.weekdays);
  switch (rule.cadence) {
    case "daily":
      break;
    case "weekly":
      if (days.length === 0) errors.weekdays = "Pick at least one day";
      break;
    case "monthly":
      if (rule.monthlyMode === "weekday_of_month") {
        if (days.length === 0) errors.weekdays = "Pick at least one day";
        if (!validWeekOfMonth(rule.weekOfMonth)) errors.weekOfMonth = "Pick which week of the month";
      } else if (rule.monthlyMode === "day_of_month") {
        const n = rule.dayOfMonth;
        if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 31) {
          errors.dayOfMonth = "Day of month must be 1 to 31";
        }
      } else {
        errors.monthlyMode = "Choose how the month repeats";
      }
      break;
    default:
      errors.cadence = "Choose how often it repeats";
  }
  return errors;
}

/** First error message in field order, or null when valid. */
export function firstRuleError(errors: RuleErrors): string | null {
  const order: RuleErrorField[] = [
    "title",
    "cadence",
    "weekdays",
    "monthlyMode",
    "weekOfMonth",
    "dayOfMonth",
    "startDate",
    "endDate",
    "comment",
  ];
  for (const field of order) if (errors[field]) return errors[field]!;
  return null;
}

/**
 * Canonical rule fields: trims text, and keeps only the fields the chosen cadence uses
 * (weekdays sorted and de-duplicated). Does not validate.
 */
export function cleanRuleFields(fields: RecurringRuleFields): RecurringRuleFields {
  const comment = fields.comment?.trim();
  const out: RecurringRuleFields = {
    title: (fields.title ?? "").trim(),
    cadence: fields.cadence,
    startDate: fields.startDate,
  };
  if (comment) out.comment = comment;
  if (fields.endDate) out.endDate = fields.endDate;
  if (fields.cadence === "weekly") {
    out.weekdays = validWeekdays(fields.weekdays);
  } else if (fields.cadence === "monthly") {
    if (fields.monthlyMode) out.monthlyMode = fields.monthlyMode;
    if (fields.monthlyMode === "weekday_of_month") {
      out.weekdays = validWeekdays(fields.weekdays);
      if (fields.weekOfMonth !== undefined) out.weekOfMonth = fields.weekOfMonth;
    } else if (fields.monthlyMode === "day_of_month" && fields.dayOfMonth !== undefined) {
      out.dayOfMonth = fields.dayOfMonth;
    }
  }
  return out;
}

/**
 * Read-time normalisation for `store.recurringTasks`. Old stores lack the key (-> []).
 * Drops rules that can't work (bad cadence/dates/shape), drops weekdays outside 0-6 and
 * duplicates, and defaults `active` to true only when it is missing.
 */
export function normalizeRecurringTasks(raw: unknown): RecurringTask[] {
  if (!Array.isArray(raw)) return [];
  const out: RecurringTask[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || seen.has(r.id)) continue;
    if (typeof r.title !== "string") continue;
    if (r.cadence !== "daily" && r.cadence !== "weekly" && r.cadence !== "monthly") continue;
    if (!isRealDayKey(r.startDate)) continue;
    if (r.endDate !== undefined && r.endDate !== null && !isRealDayKey(r.endDate)) continue;

    const fields = cleanRuleFields({
      title: r.title,
      comment: typeof r.comment === "string" ? r.comment : undefined,
      cadence: r.cadence,
      weekdays: validWeekdays(r.weekdays),
      monthlyMode:
        r.monthlyMode === "weekday_of_month" || r.monthlyMode === "day_of_month"
          ? r.monthlyMode
          : undefined,
      weekOfMonth: validWeekOfMonth(r.weekOfMonth) ? r.weekOfMonth : undefined,
      dayOfMonth: typeof r.dayOfMonth === "number" ? r.dayOfMonth : undefined,
      startDate: r.startDate,
      endDate: typeof r.endDate === "string" ? r.endDate : undefined,
    });
    if (Object.keys(validateRule(fields)).length > 0) continue;

    const now = new Date(0).toISOString();
    seen.add(r.id);
    out.push({
      ...fields,
      id: r.id,
      active: typeof r.active === "boolean" ? r.active : true,
      ...(isRealDayKey(r.generatedThrough) ? { generatedThrough: r.generatedThrough } : {}),
      createdAt: typeof r.createdAt === "string" ? r.createdAt : now,
      updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : now,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Occurrences                                                         */
/* ------------------------------------------------------------------ */

type PatternRule = Pick<
  RecurringTask,
  "cadence" | "weekdays" | "monthlyMode" | "weekOfMonth" | "dayOfMonth"
>;

function matchesPattern(rule: PatternRule, dayKey: string): boolean {
  if (rule.cadence === "daily") return true;
  const weekday = weekdayOf(dayKey);
  if (rule.cadence === "weekly") return (rule.weekdays ?? []).includes(weekday);
  if (rule.cadence !== "monthly") return false;

  const [, , day] = parseKey(dayKey)!;
  if (rule.monthlyMode === "day_of_month") {
    if (rule.dayOfMonth === undefined) return false;
    // 29-31 clamp to the month's last day, so "31" fires every month.
    return day === Math.min(rule.dayOfMonth, daysInMonthOf(dayKey));
  }
  if (rule.monthlyMode === "weekday_of_month") {
    if (!(rule.weekdays ?? []).includes(weekday)) return false;
    if (rule.weekOfMonth === "last") return day + 7 > daysInMonthOf(dayKey);
    if (rule.weekOfMonth === undefined) return false;
    return Math.ceil(day / 7) === rule.weekOfMonth; // 1st = days 1-7, 2nd = 8-14, ...
  }
  return false;
}

/** True when the rule fires on `dayKey` (pattern plus start/end bounds; ignores `active`). */
export function occursOn(rule: RecurringTask, dayKey: string): boolean {
  if (!isRealDayKey(dayKey)) return false;
  if (dayKey < rule.startDate) return false;
  if (rule.endDate && dayKey > rule.endDate) return false;
  return matchesPattern(rule, dayKey);
}

/** Inclusive, ascending occurrences in [from, to], clamped to start/end. Empty when paused. */
export function occurrencesBetween(rule: RecurringTask, from: string, to: string): string[] {
  if (!rule.active || !isRealDayKey(from) || !isRealDayKey(to) || from > to) return [];
  const first = maxKey(from, rule.startDate);
  const last = rule.endDate ? minKey(to, rule.endDate) : to;
  const out: string[] = [];
  for (let key = first; key <= last; key = shiftDayKey(key, 1)) {
    if (matchesPattern(rule, key)) out.push(key);
  }
  return out;
}

/** First occurrence strictly after `afterDayKey`, or undefined (ended, or nothing found). Ignores `active`. */
export function nextOccurrence(rule: RecurringTask, afterDayKey: string): string | undefined {
  if (!isRealDayKey(afterDayKey)) return undefined;
  const from = maxKey(shiftDayKey(afterDayKey, 1), rule.startDate);
  for (let i = 0, key = from; i < NEXT_SEARCH_LIMIT_DAYS; i++, key = shiftDayKey(key, 1)) {
    if (rule.endDate && key > rule.endDate) return undefined;
    if (matchesPattern(rule, key)) return key;
  }
  return undefined;
}

/** Human summary, e.g. "Every Mon, Tue" or "Last Fri of every month". */
export function ruleSummary(rule: PatternRule): string {
  const days = [...WEEKDAY_ORDER].filter((d) => (rule.weekdays ?? []).includes(d));
  const names = days.map((d) => WEEKDAY_SHORT[d]).join(", ");
  switch (rule.cadence) {
    case "daily":
      return "Every day";
    case "weekly":
      if (days.length === 7) return "Every day";
      if (days.length === 5 && WEEKDAY_PRESET.every((d) => days.includes(d))) {
        return "Every weekday";
      }
      return names ? `Every ${names}` : "Weekly";
    case "monthly":
      if (rule.monthlyMode === "day_of_month" && rule.dayOfMonth !== undefined) {
        return rule.dayOfMonth >= 29
          ? `Day ${rule.dayOfMonth} of every month (last day in shorter months)`
          : `Day ${rule.dayOfMonth} of every month`;
      }
      if (rule.monthlyMode === "weekday_of_month" && rule.weekOfMonth !== undefined) {
        const nth = WEEK_OF_MONTH_LABELS[String(rule.weekOfMonth)];
        return names ? `${nth} ${names} of every month` : `${nth} week of every month`;
      }
      return "Monthly";
    default:
      return "";
  }
}

/** Up to `count` upcoming dates starting from `fromDayKey` (inclusive). */
export function upcomingDates(rule: RecurringTask, fromDayKey: string, count: number): string[] {
  const out: string[] = [];
  let after = shiftDayKey(fromDayKey, -1);
  while (out.length < count) {
    const next = nextOccurrence(rule, after);
    if (!next) break;
    out.push(next);
    after = next;
  }
  return out;
}

/** True once the rule's end date is behind `today`. */
export function isRuleEnded(rule: Pick<RecurringTask, "endDate">, today: string): boolean {
  return Boolean(rule.endDate && rule.endDate < today);
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Days a rule may create rows for: from max(marker + 1, start, today - CATCHUP) to
 * min(today + LOOKAHEAD, end). Null when paused or the window is empty.
 */
export function generationWindow(
  rule: RecurringTask,
  today: string
): { from: string; to: string } | null {
  if (!rule.active || !isRealDayKey(today)) return null;
  let from = maxKey(rule.startDate, shiftDayKey(today, -CATCHUP_DAYS));
  if (rule.generatedThrough) from = maxKey(from, shiftDayKey(rule.generatedThrough, 1));
  let to = shiftDayKey(today, LOOKAHEAD_DAYS);
  if (rule.endDate) to = minKey(to, rule.endDate);
  return from <= to ? { from, to } : null;
}

/** Dates to create for a rule now: the window's occurrences, minus days that already have an instance. */
export function planGeneration(
  rule: RecurringTask,
  today: string,
  existingTasks: readonly Task[]
): string[] {
  const window = generationWindow(rule, today);
  if (!window) return [];
  const taken = new Set<string>();
  for (const t of existingTasks) {
    if (t.recurringId !== rule.id) continue;
    const day = taskDay(t);
    if (day) taken.add(day);
  }
  return occurrencesBetween(rule, window.from, window.to).filter((d) => !taken.has(d));
}

function instanceFor(rule: RecurringTask, dayKey: string, now: string, id: string): Task {
  return {
    id,
    title: rule.title,
    description: rule.comment,
    status: "todo",
    priority: "medium",
    source: "manual",
    dueDate: dayKey,
    tags: [],
    recurringId: rule.id,
    createdAt: now,
    updatedAt: now,
  };
}

function generateForRule(
  rule: RecurringTask,
  today: string,
  tasks: readonly Task[],
  now: string,
  newId: () => string
): { rule: RecurringTask; created: Task[] } {
  if (!rule.active) return { rule, created: [] };
  const created = planGeneration(rule, today, tasks).map((day) =>
    instanceFor(rule, day, now, newId())
  );
  // The marker only moves forward, so a deleted or completed instance is never recreated.
  let through = shiftDayKey(today, LOOKAHEAD_DAYS);
  if (rule.endDate) through = minKey(through, rule.endDate);
  if (rule.generatedThrough && rule.generatedThrough >= through) return { rule, created };
  return { rule: { ...rule, generatedThrough: through }, created };
}

/**
 * Creates the due rows for every active rule. Pure (ids come from `newId`), idempotent, and safe
 * to re-run on a Blob retry. Returns the same store object when nothing changed.
 */
export function generateAll(
  store: DashboardStore,
  today: string,
  now: string,
  newId: () => string = uuidv4
): { store: DashboardStore; created: number } {
  const rules = store.recurringTasks ?? [];
  if (rules.length === 0 || !isRealDayKey(today)) return { store, created: 0 };

  // Rule createdAt order keeps S. No. stable (rows of one run share a createdAt).
  const ordered = [...rules].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const updated = new Map<string, RecurringTask>();
  const created: Task[] = [];
  for (const rule of ordered) {
    const result = generateForRule(rule, today, [...store.tasks, ...created], now, newId);
    if (result.rule !== rule) updated.set(rule.id, result.rule);
    created.push(...result.created);
  }
  if (updated.size === 0 && created.length === 0) return { store, created: 0 };
  return {
    store: {
      ...store,
      tasks: created.length ? [...store.tasks, ...created] : store.tasks,
      recurringTasks: rules.map((r) => updated.get(r.id) ?? r),
    },
    created: created.length,
  };
}

/* ------------------------------------------------------------------ */
/* Rule edits                                                          */
/* ------------------------------------------------------------------ */

/**
 * A future row the user hasn't touched: still todo with the rule's own title and comment.
 * Pass `today` to also require dueDate > today.
 */
export function isUntouchedInstance(
  task: Task,
  rule: Pick<RecurringTask, "id" | "title" | "comment">,
  today?: string
): boolean {
  if (task.recurringId !== rule.id) return false;
  if (task.status !== "todo") return false;
  if (task.title !== rule.title) return false;
  if ((task.description ?? "") !== (rule.comment ?? "")) return false;
  if (today !== undefined) {
    const day = taskDay(task);
    if (!day || day <= today) return false;
  }
  return true;
}

function withoutUntouchedFuture(tasks: Task[], rule: RecurringTask, today: string): Task[] {
  return tasks.filter((t) => !isUntouchedInstance(t, rule, today));
}

function ruleFields(rule: RecurringTask): RecurringRuleFields {
  return {
    title: rule.title,
    comment: rule.comment,
    cadence: rule.cadence,
    weekdays: rule.weekdays,
    monthlyMode: rule.monthlyMode,
    weekOfMonth: rule.weekOfMonth,
    dayOfMonth: rule.dayOfMonth,
    startDate: rule.startDate,
    endDate: rule.endDate,
  };
}

/** Applies a patch onto a rule's fields: null clears, undefined leaves, anything else sets. */
export function mergeRuleFields(
  rule: RecurringTask,
  patch: RecurringRulePatch
): RecurringRuleFields {
  const merged: Record<string, unknown> = { ...ruleFields(rule) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "active" || value === undefined) continue;
    merged[key] = value === null ? undefined : value;
  }
  return cleanRuleFields(merged as unknown as RecurringRuleFields);
}

export type RuleChangeResult =
  | { status: "ok"; store: DashboardStore; rule: RecurringTask; created: number }
  | { status: "not_found" }
  | { status: "invalid"; error: string };

/** Adds a rule and creates its due rows at once (a rule that includes today gets today's row). */
export function createRule(
  store: DashboardStore,
  fields: RecurringRuleFields,
  today: string,
  now: string,
  id: string,
  newId: () => string = uuidv4
): RuleChangeResult {
  const cleaned = cleanRuleFields(fields);
  const errors = validateRule(cleaned);
  const error = firstRuleError(errors);
  if (error) return { status: "invalid", error };
  if (!isRealDayKey(today)) return { status: "invalid", error: "Today's date is required" };
  const rules = store.recurringTasks ?? [];
  if (rules.length >= MAX_RECURRING_RULES) {
    return { status: "invalid", error: RECURRING_CAP_MESSAGE };
  }

  const rule: RecurringTask = {
    ...cleaned,
    id,
    active: true,
    // No backfill: a rule starting today gets today's row, an older start begins at today.
    generatedThrough: shiftDayKey(maxKey(cleaned.startDate, today), -1),
    createdAt: now,
    updatedAt: now,
  };
  const generated = generateAll({ ...store, recurringTasks: [...rules, rule] }, today, now, newId);
  const saved = (generated.store.recurringTasks ?? []).find((r) => r.id === id) ?? rule;
  return { status: "ok", store: generated.store, rule: saved, created: generated.created };
}

/**
 * Edit, pause or resume (via `active`). Affects only future days: untouched future rows are
 * removed and regenerated, touched rows, past rows and an existing (or deleted) today row stay.
 */
export function applyRuleEdit(
  store: DashboardStore,
  id: string,
  patch: RecurringRulePatch,
  today: string,
  now: string,
  newId: () => string = uuidv4
): RuleChangeResult {
  const rules = store.recurringTasks ?? [];
  const old = rules.find((r) => r.id === id);
  if (!old) return { status: "not_found" };
  if (!isRealDayKey(today)) return { status: "invalid", error: "Today's date is required" };

  const fields = mergeRuleFields(old, patch);
  const error = firstRuleError(validateRule(fields));
  if (error) return { status: "invalid", error };

  const active = patch.active ?? old.active;
  let through = old.generatedThrough;
  if (through !== undefined) through = minKey(through, today);
  if (active && !old.active) {
    // Resume: continue from today, days paused are not backfilled.
    through = maxKey(through ?? shiftDayKey(today, -1), shiftDayKey(today, -1));
  } else if (active) {
    const next = { ...old, ...fields, active };
    // Newly includes today: create today's row now. An existing or deleted row is left alone.
    if (occursOn(next, today) && !(old.active && occursOn(old, today)) && through !== undefined) {
      through = minKey(through, shiftDayKey(today, -1));
    }
  }

  const edited: RecurringTask = {
    ...old,
    ...fields,
    // cleanRuleFields drops unused fields; make sure they don't linger from the old rule.
    comment: fields.comment,
    endDate: fields.endDate,
    weekdays: fields.weekdays,
    monthlyMode: fields.monthlyMode,
    weekOfMonth: fields.weekOfMonth,
    dayOfMonth: fields.dayOfMonth,
    active,
    generatedThrough: through,
    updatedAt: now,
  };

  const kept = withoutUntouchedFuture(store.tasks, old, today);
  const result = generateForRule(edited, today, kept, now, newId);
  const saved = result.rule;
  return {
    status: "ok",
    store: {
      ...store,
      tasks: result.created.length ? [...kept, ...result.created] : kept,
      recurringTasks: rules.map((r) => (r.id === id ? saved : r)),
    },
    rule: saved,
    created: result.created.length,
  };
}

/**
 * Deletes a rule: untouched future rows are removed, remaining rows lose `recurringId`
 * and become plain tasks.
 */
export function deleteRule(
  store: DashboardStore,
  id: string,
  today: string
): { status: "ok"; store: DashboardStore } | { status: "not_found" } {
  const rules = store.recurringTasks ?? [];
  const old = rules.find((r) => r.id === id);
  if (!old) return { status: "not_found" };
  const tasks = withoutUntouchedFuture(store.tasks, old, today).map((t) => {
    if (t.recurringId !== id) return t;
    const { recurringId, ...rest } = t;
    void recurringId;
    return rest;
  });
  return {
    status: "ok",
    store: { ...store, tasks, recurringTasks: rules.filter((r) => r.id !== id) },
  };
}
