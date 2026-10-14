import type { ReleaseCalendarDay, ReleaseCalendarWeek } from "./types";

// View helpers for the Release Calendar snapshot (month navigation, Mon–Fri slots, Home card).

/** "yyyy-MM" of every month that has at least one sheet day, ascending. */
export function listSnapshotMonths(weeks: ReleaseCalendarWeek[]): string[] {
  const months = new Set<string>();
  for (const week of weeks) {
    for (const day of week.days) months.add(day.date.slice(0, 7));
  }
  return [...months].sort();
}

/** Month to open on: today's month when the snapshot has it, else the nearest snapshot month. */
export function pickInitialMonth(months: string[], todayKey: string): string | undefined {
  if (months.length === 0) return undefined;
  const current = todayKey.slice(0, 7);
  if (months.includes(current)) return current;
  const before = months.filter((m) => m < current);
  return before.length > 0 ? before[before.length - 1] : months[0];
}

/** Weeks with at least one day in `month` ("yyyy-MM"), in sheet order. */
export function weeksInMonth(weeks: ReleaseCalendarWeek[], month: string): ReleaseCalendarWeek[] {
  return weeks.filter((week) => week.days.some((day) => day.date.startsWith(month)));
}

const LABEL_SLOT: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };

export interface WeekSlots {
  /** Mon–Fri, by the weekday written in the sheet header. */
  slots: (ReleaseCalendarDay | undefined)[];
  /** Days that don't fit a Mon–Fri slot (weekend columns, duplicate weekdays). Never dropped. */
  extras: ReleaseCalendarDay[];
}

export function layoutWeek(week: ReleaseCalendarWeek): WeekSlots {
  const slots: (ReleaseCalendarDay | undefined)[] = [undefined, undefined, undefined, undefined, undefined];
  const extras: ReleaseCalendarDay[] = [];
  for (const day of week.days) {
    const slot = LABEL_SLOT[day.label.slice(0, 3).toLowerCase()];
    if (slot !== undefined && !slots[slot]) slots[slot] = day;
    else extras.push(day);
  }
  return { slots, extras };
}

export function dayHasEntries(day: ReleaseCalendarDay | undefined): boolean {
  return !!day && day.groups.some((g) => g.heading || g.items.length > 0);
}

export interface UpcomingRelease {
  date: string;
  heading: string;
  items: string[];
}

/** Next release headings dated `todayKey` or later, in date then sheet order. */
export function upcomingReleases(
  weeks: ReleaseCalendarWeek[],
  todayKey: string,
  limit = 5
): UpcomingRelease[] {
  const found: UpcomingRelease[] = [];
  for (const week of weeks) {
    for (const day of week.days) {
      if (day.date < todayKey) continue;
      for (const group of day.groups) {
        if (group.heading) found.push({ date: day.date, heading: group.heading, items: group.items });
      }
    }
  }
  // Stable sort keeps sheet order within a day.
  return found.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
