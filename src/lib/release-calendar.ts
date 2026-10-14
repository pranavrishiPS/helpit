import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

// Mon–Fri month layout helpers (used by Scrum attendance).

export interface CalendarDay {
  date: Date;
  key: string;
  inMonth: boolean;
}

export interface WorkWeekRow {
  weekLabel: string;
  days: CalendarDay[];
}

/** Mon–Fri rows with ISO week labels. */
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

export function isCalendarDayToday(day: CalendarDay): boolean {
  return isToday(day.date);
}
