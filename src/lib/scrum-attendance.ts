import type { ScrumAttendanceEntry, ScrumHoliday, ScrumStatus } from "./types";

export const SCRUM_STATUSES: ScrumStatus[] = ["on_time", "late", "leave", "other"];

export const SCRUM_STATUS_LABELS: Record<ScrumStatus, string> = {
  on_time: "On time",
  late: "Late",
  leave: "Leave",
  other: "Other",
};

export interface ScrumMemberInsight {
  member: string;
  onTime: number;
  late: number;
  leave: number;
  /** on_time + late + leave — the total tracked days this insight is out of. "Other" is excluded. */
  totalDays: number;
  /** Percentage of on_time/late days the member was on time, 0-100. "Leave" and "other" days are excluded. */
  onTimeRate: number;
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
    const attendedDays = onTime + late;

    return {
      member,
      onTime,
      late,
      leave,
      totalDays: onTime + late + leave,
      onTimeRate: attendedDays > 0 ? Math.round((onTime / attendedDays) * 100) : 0,
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
