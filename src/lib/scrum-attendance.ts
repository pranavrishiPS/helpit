import type { ScrumAttendanceEntry, ScrumHoliday, ScrumStatus } from "./types";

export const SCRUM_STATUSES: ScrumStatus[] = ["on_time", "late", "leave", "first_half_off", "other"];

export const SCRUM_STATUS_LABELS: Record<ScrumStatus, string> = {
  on_time: "On time",
  late: "Late",
  leave: "Leave",
  first_half_off: "1st half off",
  other: "Other",
};

/** First scrum date on which "1st half off" is offered as a status. */
export const FIRST_HALF_OFF_START_DATE = "2026-10-01";

/**
 * Statuses offered for a scrum date. "1st half off" only exists from
 * FIRST_HALF_OFF_START_DATE onward, but is kept visible on an earlier date
 * if an entry already uses it (e.g. synced from the sheet).
 */
export function statusesForDate(date: string, current?: ScrumStatus): ScrumStatus[] {
  return SCRUM_STATUSES.filter(
    (status) => isStatusAllowedOnDate(status, date) || current === status
  );
}

/** Whether a status may be newly recorded for a scrum date ("1st half off" only from FIRST_HALF_OFF_START_DATE). */
export function isStatusAllowedOnDate(status: ScrumStatus, date: string): boolean {
  return status !== "first_half_off" || date >= FIRST_HALF_OFF_START_DATE;
}

export interface ScrumMemberInsight {
  member: string;
  onTime: number;
  late: number;
  leave: number;
  firstHalfOff: number;
  /** on_time + late + leave + first_half_off — the total tracked days this insight is out of. "Other" is excluded. */
  totalDays: number;
  /** on_time + late — scrums the member actually attended. Denominator for the on-time rate and the Late column. */
  attendedDays: number;
  /**
   * Percentage of attended (on_time/late) days the member was on time, 0-100.
   * "Leave", "1st half off" and "other" days are excluded. null when attendedDays is 0.
   */
  onTimeRate: number | null;
}

/** Insights for every member with either a roster entry or at least one logged record. */
export function computeScrumInsights(
  members: string[],
  entries: ScrumAttendanceEntry[]
): ScrumMemberInsight[] {
  const allMembers = [...new Set([...members, ...entries.map((e) => e.member)])];

  return allMembers.map((member) => {
    const memberEntries = entries.filter((e) => e.member === member);
    const onTime = memberEntries.filter((e) => e.status === "on_time").length;
    const late = memberEntries.filter((e) => e.status === "late").length;
    const leave = memberEntries.filter((e) => e.status === "leave").length;
    const firstHalfOff = memberEntries.filter((e) => e.status === "first_half_off").length;
    const attendedDays = onTime + late;

    return {
      member,
      onTime,
      late,
      leave,
      firstHalfOff,
      totalDays: onTime + late + leave + firstHalfOff,
      attendedDays,
      onTimeRate: attendedDays > 0 ? Math.round((onTime / attendedDays) * 100) : null,
    };
  });
}

/** Entries whose date falls in the given month (format "yyyy-MM"). */
export function entriesForMonth(
  entries: ScrumAttendanceEntry[],
  monthKey: string
): ScrumAttendanceEntry[] {
  return entries.filter((e) => e.date.startsWith(monthKey));
}

/** Distinct months (format "yyyy-MM") that have at least one logged entry, most recent first. */
export function listAttendanceMonths(entries: ScrumAttendanceEntry[]): string[] {
  return [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort().reverse();
}

/** Distinct scrum dates that have at least one logged entry, most recent first. */
export function listScrumDates(entries: ScrumAttendanceEntry[]): string[] {
  return [...new Set(entries.map((e) => e.date))].sort().reverse();
}

export function entriesForDate(
  entries: ScrumAttendanceEntry[],
  date: string
): ScrumAttendanceEntry[] {
  return entries.filter((e) => e.date === date);
}

/** date (YYYY-MM-DD) -> entry, for a single member's entries. */
export function entriesByDateForMember(
  entries: ScrumAttendanceEntry[],
  member: string
): Map<string, ScrumAttendanceEntry> {
  const map = new Map<string, ScrumAttendanceEntry>();
  for (const entry of entries) {
    if (entry.member === member) map.set(entry.date, entry);
  }
  return map;
}

/** The holiday entry for a given date, if that date is marked as a holiday. */
export function holidayForDate(
  holidays: ScrumHoliday[],
  date: string
): ScrumHoliday | undefined {
  return holidays.find((h) => h.date === date);
}

/** member name -> last working day (YYYY-MM-DD). Keys use the roster spelling. */
export type ScrumMemberLastDays = Record<string, string>;

/** A member's last working day, matched case-insensitively; undefined when none is set. */
export function lastDayFor(
  lastDays: ScrumMemberLastDays | undefined,
  member: string
): string | undefined {
  if (!lastDays) return undefined;
  if (lastDays[member]) return lastDays[member];
  const target = member.trim().toLowerCase();
  const key = Object.keys(lastDays).find((k) => k.trim().toLowerCase() === target);
  return key ? lastDays[key] : undefined;
}

/** True when the member is still on the team on `date` (no last day, or date <= last day). */
export function isMemberActiveOn(
  lastDays: ScrumMemberLastDays | undefined,
  member: string,
  date: string
): boolean {
  const lastDay = lastDayFor(lastDays, member);
  return !lastDay || date <= lastDay;
}

/** Roster members to show in the daily logging list for `date`. */
export function activeMembersOn(
  members: string[],
  lastDays: ScrumMemberLastDays | undefined,
  date: string
): string[] {
  return members.filter((m) => isMemberActiveOn(lastDays, m, date));
}

/**
 * Roster members to include in a month's insights (format "yyyy-MM"): drops anyone whose
 * last day is before the month's first day. Members with entries in the month still show,
 * since computeScrumInsights adds everyone who has an entry.
 */
export function insightMembersForMonth(
  members: string[],
  lastDays: ScrumMemberLastDays | undefined,
  monthKey: string
): string[] {
  return activeMembersOn(members, lastDays, `${monthKey}-01`);
}

/** Copy of lastDays with every key matching `member` (case-insensitive) removed. */
export function withoutLastDay(
  lastDays: ScrumMemberLastDays | undefined,
  member: string
): ScrumMemberLastDays {
  const target = member.trim().toLowerCase();
  return Object.fromEntries(
    Object.entries(lastDays ?? {}).filter(([k]) => k.trim().toLowerCase() !== target)
  );
}
