import {
  addDays,
  addHours,
  format,
  isPast,
  isToday,
  isTomorrow,
  nextMonday,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";

export interface ReminderPreset {
  id: string;
  label: string;
  getValue: () => string;
}

export function getReminderPresets(): ReminderPreset[] {
  const now = new Date();

  return [
    {
      id: "later-today",
      label: "Later today",
      getValue: () => {
        const evening = setMinutes(setHours(startOfDay(now), 18), 0);
        return (evening > now ? evening : addHours(now, 1)).toISOString();
      },
    },
    {
      id: "tomorrow",
      label: "Tomorrow morning",
      getValue: () =>
        setMinutes(setHours(startOfDay(addDays(now, 1)), 9), 0).toISOString(),
    },
    {
      id: "next-week",
      label: "Next Monday",
      getValue: () =>
        setMinutes(setHours(startOfDay(nextMonday(now)), 9), 0).toISOString(),
    },
  ];
}

export function formatReminderAt(iso?: string): string | null {
  if (!iso) return null;
  const date = parseISO(iso);
  const time = format(date, "h:mm a");
  if (isToday(date)) return `Today, ${time}`;
  if (isTomorrow(date)) return `Tomorrow, ${time}`;
  return format(date, "MMM d, h:mm a");
}

export function isReminderDue(iso?: string): boolean {
  if (!iso) return false;
  return isPast(parseISO(iso));
}

export function reminderToDueDate(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd");
}

export function toDateTimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const date = parseISO(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
