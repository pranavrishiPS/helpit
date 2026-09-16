import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import type { Release } from "./types";

export interface CalendarDay {
  date: Date;
  key: string;
  inMonth: boolean;
}

export interface WorkWeekRow {
  weekLabel: string;
  days: CalendarDay[];
}

/** Date used to plot a release on the planning calendar. */
export function getReleaseCalendarDate(release: Release): string | undefined {
  if (release.status === "live") {
    return release.actualDate ?? release.targetDate;
  }
  return release.targetDate;
}

export function groupReleasesByCalendarDate(releases: Release[]): Map<string, Release[]> {
  const map = new Map<string, Release[]>();

  for (const release of releases) {
    const dateKey = getReleaseCalendarDate(release);
    if (!dateKey) continue;
    const bucket = map.get(dateKey) ?? [];
    bucket.push(release);
    map.set(dateKey, bucket);
  }

  for (const [, bucket] of map) {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  }

  return map;
}

export function getUndatedReleases(releases: Release[]): Release[] {
  return releases.filter((r) => !getReleaseCalendarDate(r));
}

export function buildCalendarDays(month: Date): CalendarDay[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  return eachDayOfInterval({ start, end }).map((date) => ({
    date,
    key: format(date, "yyyy-MM-dd"),
    inMonth: isSameMonth(date, month),
  }));
}

/** Mon–Fri rows with ISO week labels (matches release calendar sheet). */
export function buildWorkWeeks(month: Date): WorkWeekRow[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start, end });
  const rows: WorkWeekRow[] = [];

  for (let i = 0; i < allDays.length; i += 7) {
    const weekBlock = allDays.slice(i, i + 7);
    const weekdays = weekBlock.slice(0, 5);
    if (!weekdays.some((d) => isSameMonth(d, month))) continue;

    rows.push({
      weekLabel: `Week ${getISOWeek(weekdays[0])}`,
      days: weekdays.map((date) => ({
        date,
        key: format(date, "yyyy-MM-dd"),
        inMonth: isSameMonth(date, month),
      })),
    });
  }

  return rows;
}

export function shiftCalendarMonth(month: Date, delta: -1 | 1): Date {
  return delta === 1 ? addMonths(month, 1) : subMonths(month, 1);
}

export function findDefaultRelease(
  releases: Release[],
  month: Date
): Release | undefined {
  const dated = releases
    .map((r) => ({ release: r, date: getReleaseCalendarDate(r) }))
    .filter((entry): entry is { release: Release; date: string } => !!entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const inMonth = dated.find((entry) => isSameMonth(parseISO(entry.date), month));
  if (inMonth) return inMonth.release;

  const inFlight = dated.find((entry) => entry.release.status !== "live");
  return inFlight?.release ?? dated[0]?.release;
}

export function isCalendarDaySelected(
  dayKey: string,
  selectedRelease: Release | undefined
): boolean {
  if (!selectedRelease) return false;
  return getReleaseCalendarDate(selectedRelease) === dayKey;
}

export function isCalendarDayToday(day: CalendarDay): boolean {
  return isToday(day.date);
}

export function isCalendarDaySameAs(day: CalendarDay, date: Date): boolean {
  return isSameDay(day.date, date);
}
