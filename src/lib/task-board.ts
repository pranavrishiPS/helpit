import { format, parseISO } from "date-fns";
import type { Task, TaskStatus } from "./types";

// Pure helpers for the day-wise Tasks tab (docs/specs/tasks-board-daywise.md §5).
// Every helper takes the date key as a parameter so none of them reads the clock,
// except `todayKey`, whose `now` argument defaults to the current time.

/** Status menu order. */
export const BOARD_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** How many earlier days (that have tasks) show before "Show older days". */
export const RECENT_DAY_LIMIT = 7;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date as yyyy-MM-dd (never UTC, so 00:30 local is still "today"). */
export function todayKey(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

/** Day before/after `key` (n may be negative). Safe across month, year and DST boundaries. */
export function shiftDayKey(key: string, n: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  // Building from calendar components keeps this on local midnight, so a 23h/25h DST day
  // can never land on the wrong date.
  const shifted = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + n);
  return format(shifted, "yyyy-MM-dd");
}

/** True for a well-formed yyyy-MM-dd key. */
export function isDayKey(value: string | undefined): value is string {
  return typeof value === "string" && DAY_KEY.test(value);
}

/** Date part (yyyy-MM-dd) of a task's due date, or undefined when missing or malformed. */
export function taskDay(task: Pick<Task, "dueDate">): string | undefined {
  const raw = task.dueDate;
  if (!raw) return undefined;
  const day = raw.slice(0, 10);
  return isDayKey(day) ? day : undefined;
}

/** Date chip label, e.g. "5th Oct, 26". */
export function formatDayChip(key: string): string {
  if (!isDayKey(key)) return key;
  return format(parseISO(key), "do MMM, yy");
}

/** Tasks due on `dayKey` (date part only, in case a value carries a time). */
export function tasksForDay(tasks: Task[], dayKey: string): Task[] {
  return tasks.filter((t) => taskDay(t) === dayKey);
}

/** Done / total for tasks due on `dayKey`. */
export function dayProgress(tasks: Task[], dayKey: string): { done: number; total: number } {
  const day = tasksForDay(tasks, dayKey);
  return { done: day.filter((t) => t.status === "done").length, total: day.length };
}

/** Oldest first by createdAt, so a row's S. No. never changes when its status does. */
export function sortByCreated(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export interface DaySection {
  /** Stable key: the yyyy-MM-dd day, or "none" for the undated section. */
  key: string;
  /** Local day (yyyy-MM-dd); undefined for the undated section. */
  dayKey?: string;
  tasks: Task[];
}

export interface DayGroups {
  /** Always present, even when empty. */
  today: DaySection;
  /** Earlier days, newest first. */
  past: DaySection[];
  /** Future days, soonest first. */
  upcoming: DaySection[];
  /** Tasks without (or with a malformed) due date. */
  noDate: DaySection;
}

/**
 * Groups tasks into day sections by local due date. Each section's tasks are ordered by
 * createdAt ascending. `extraDays` adds empty sections for days the user asked to plan
 * (malformed keys and today are ignored).
 */
export function groupTasksByDay(
  tasks: Task[],
  today: string,
  extraDays: Iterable<string> = []
): DayGroups {
  const byDay = new Map<string, Task[]>();
  const undated: Task[] = [];
  for (const task of tasks) {
    const day = taskDay(task);
    if (day === undefined) undated.push(task);
    else byDay.set(day, [...(byDay.get(day) ?? []), task]);
  }
  for (const day of extraDays) {
    if (isDayKey(day) && !byDay.has(day)) byDay.set(day, []);
  }

  const section = (key: string, list: Task[]): DaySection => ({
    key,
    dayKey: key,
    tasks: sortByCreated(list),
  });

  const days = [...byDay.keys()].filter((d) => d !== today).sort();
  return {
    today: section(today, byDay.get(today) ?? []),
    past: days
      .filter((d) => d < today)
      .reverse()
      .map((d) => section(d, byDay.get(d) ?? [])),
    upcoming: days.filter((d) => d > today).map((d) => section(d, byDay.get(d) ?? [])),
    noDate: { key: "none", tasks: sortByCreated(undated) },
  };
}

/**
 * Splits earlier days (newest first) into the most recent `limit` days that have tasks and the
 * rest. Empty sections and days in `keep` (revealed by "Go to date") always stay visible.
 */
export function splitRecentDays(
  past: DaySection[],
  limit: number = RECENT_DAY_LIMIT,
  keep: ReadonlySet<string> = new Set()
): { recent: DaySection[]; older: DaySection[] } {
  const recent: DaySection[] = [];
  const older: DaySection[] = [];
  let shown = 0;
  for (const section of past) {
    if (section.tasks.length === 0 || keep.has(section.key)) {
      recent.push(section);
    } else if (shown < limit) {
      shown += 1;
      recent.push(section);
    } else {
      older.push(section);
    }
  }
  return { recent, older };
}

/** Updated task for `updateTask`: only `status` changes. */
export function statusPatch(task: Task, status: TaskStatus): Task {
  return { ...task, status };
}

/**
 * Updated task for `updateTask`: only `dueDate` changes. A missing `dayKey` clears the date;
 * the key is kept (as undefined) so the API client sends null.
 */
export function reschedulePatch(task: Task, dayKey: string | undefined): Task {
  return { ...task, dueDate: dayKey };
}

/** Updated task for an inline Items edit. Blank titles are not allowed: returns null. */
export function titlePatch(task: Task, title: string): Task | null {
  const trimmed = title.trim();
  return trimmed ? { ...task, title: trimmed } : null;
}

/** Updated task for an inline Comments edit. Blank clears the comment (key kept as undefined). */
export function commentPatch(task: Task, text: string): Task {
  const trimmed = text.trim();
  return { ...task, description: trimmed ? trimmed : undefined };
}
