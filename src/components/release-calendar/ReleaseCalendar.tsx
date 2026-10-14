"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { ReleaseCalendarDay, ReleaseCalendarEntryGroup, ReleaseCalendarWeek } from "@/lib/types";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  dayHasEntries,
  layoutWeek,
  listSnapshotMonths,
  pickInitialMonth,
  weeksInMonth,
} from "@/lib/release-calendar-view";

// Read-only month view of the Release Calendar snapshot (docs/specs/release-calendar-sheet.md §15–16).
// Shared by the owner page and the public share page: it must not import store hooks.

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const GRID_COLS = "grid-cols-[4.5rem_repeat(5,minmax(0,1fr))]";

function localDateKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

interface ReleaseCalendarProps {
  weeks: ReleaseCalendarWeek[];
  /** Server-rendered pages pass the server's date so hydration matches; the viewer's local date takes over on mount. */
  initialTodayKey?: string;
  /** Extra content at the bottom of the card (owner: parse warnings). */
  footer?: React.ReactNode;
}

export function ReleaseCalendar({ weeks, initialTodayKey, footer }: ReleaseCalendarProps) {
  const [todayKey, setTodayKey] = useState(() => initialTodayKey ?? localDateKey());
  const months = useMemo(() => listSnapshotMonths(weeks), [weeks]);
  const [month, setMonth] = useState<string | undefined>(() => pickInitialMonth(months, todayKey));
  const navigated = useRef(false);
  const scrolled = useRef(false);

  // A month that left the snapshot (after a sync) falls back to the default month.
  const activeMonth = month && months.includes(month) ? month : pickInitialMonth(months, todayKey);
  const monthIndex = activeMonth ? months.indexOf(activeMonth) : -1;
  const todayMonth = todayKey.slice(0, 7);

  // "Today" is the viewer's local date (spec §12), applied after hydration.
  const initialToday = useRef(todayKey);
  const initialMonths = useRef(months);
  useEffect(() => {
    const local = localDateKey();
    if (local === initialToday.current) return;
    setTodayKey(local);
    if (!navigated.current) setMonth(pickInitialMonth(initialMonths.current, local));
  }, []);

  function goTo(index: number) {
    const next = months[index];
    if (!next) return;
    navigated.current = true;
    setMonth(next);
  }

  function goToday() {
    navigated.current = true;
    setMonth(pickInitialMonth(months, todayKey));
  }

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
    if (e.key === "ArrowLeft") goTo(monthIndex - 1);
    else if (e.key === "ArrowRight") goTo(monthIndex + 1);
    else if (e.key === "t" || e.key === "T") goToday();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Today late in the month: bring its week into view once.
  useEffect(() => {
    if (scrolled.current || activeMonth !== todayMonth) return;
    if (Number(todayKey.slice(8, 10)) <= 15) return;
    const rows = document.querySelectorAll<HTMLElement>("[data-today-week]");
    const visible = [...rows].find((el) => el.offsetParent !== null);
    if (!visible) return;
    scrolled.current = true;
    visible.scrollIntoView({ block: "center" });
  }, [activeMonth, todayMonth, todayKey]);

  if (!activeMonth) return null;

  const visibleWeeks = weeksInMonth(weeks, activeMonth);
  const viewingTodayMonth = activeMonth === todayMonth;

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex items-center gap-x-3 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo(monthIndex - 1)}
            disabled={monthIndex <= 0}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo(monthIndex + 1)}
            disabled={monthIndex >= months.length - 1}
            aria-label="Next month"
          >
            <ChevronRight />
          </Button>
          <h2 className="ml-1.5 truncate font-display text-base font-semibold text-foreground">
            {format(parseISO(`${activeMonth}-01`), "MMMM yyyy")}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToday}
          aria-pressed={viewingTodayMonth}
          className={cn("shrink-0", viewingTodayMonth && "bg-surface-3 text-foreground")}
        >
          Today
        </Button>
      </div>

      {/* Laptop: week rows, Mon–Fri columns (same layout as the sheet). */}
      <div className="scroll-fade-x hidden overflow-x-auto sm:block">
        <div className="min-w-[40rem]">
          <div className={cn("grid border-b border-border bg-surface-2", GRID_COLS)}>
            <div className="border-r border-border py-2 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              Wk
            </div>
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="border-r border-border py-2 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>

          {visibleWeeks.map((week) => {
            const { slots, extras } = layoutWeek(week);
            const hasToday = week.days.some((d) => d.date === todayKey);
            return (
              <div
                key={`${week.label}-${week.days[0]?.date}`}
                data-today-week={hasToday ? "true" : undefined}
                className="border-b border-border last:border-b-0"
              >
                <div className={cn("grid", GRID_COLS)}>
                  <WeekLabelCell week={week} />
                  {slots.map((day, i) =>
                    day ? (
                      <DayCell key={day.date + day.label} day={day} month={activeMonth} todayKey={todayKey} />
                    ) : (
                      <div
                        key={`empty-${i}`}
                        className="min-h-[4.5rem] border-r border-border bg-surface-2/40 last:border-r-0"
                      />
                    )
                  )}
                </div>
                {extras.length > 0 && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border bg-card px-3 py-2">
                    {extras.map((day) => (
                      <div key={day.date + day.label} className="min-w-0">
                        <p className="text-[11px] font-medium leading-4 text-foreground">{day.label}</p>
                        <DayEntries groups={day.groups} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone: one block per week, only days with entries (and today). */}
      <div className="sm:hidden">
        {visibleWeeks.map((week) => {
          const days = week.days.filter((d) => dayHasEntries(d) || d.date === todayKey);
          const hasToday = week.days.some((d) => d.date === todayKey);
          const weekName = week.weekNumber !== undefined ? `Week ${week.weekNumber}` : week.label;
          return (
            <div
              key={`${week.label}-${week.days[0]?.date}`}
              data-today-week={hasToday ? "true" : undefined}
              className="border-b border-border px-3 py-3 last:border-b-0"
            >
              {(weekName || week.note) && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {weekName}
                  {week.note && (
                    <span className="ml-2 whitespace-pre-line font-normal normal-case tracking-normal">
                      {week.note}
                    </span>
                  )}
                </p>
              )}
              {days.length === 0 ? (
                <p className="mt-1.5 text-xs text-subtle">No entries</p>
              ) : (
                days.map((day) => {
                  const today = day.date === todayKey;
                  return (
                    <div
                      key={day.date + day.label}
                      aria-current={today ? "date" : undefined}
                      className={cn(
                        "grid grid-cols-[5rem_1fr] gap-x-3 py-1.5",
                        today && "-mx-3 rounded-none bg-pop-soft/50 px-3"
                      )}
                    >
                      <span
                        className={cn(
                          "self-start whitespace-nowrap text-xs font-medium text-foreground",
                          today && "rounded-full bg-accent px-1.5 font-semibold text-on-fill"
                        )}
                      >
                        {format(parseISO(day.date), "EEE, MMM d")}
                      </span>
                      <DayEntries groups={day.groups} />
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {footer}
    </Card>
  );
}

function WeekLabelCell({ week }: { week: ReleaseCalendarWeek }) {
  return (
    <div className="border-r border-border bg-surface-2/60 p-2">
      {week.weekNumber !== undefined ? (
        <p className="text-[11px] font-semibold tabular-nums text-foreground">
          <span className="sr-only">Week </span>
          {week.weekNumber}
        </p>
      ) : (
        week.label && (
          <p className="break-words text-[11px] font-semibold text-foreground">{week.label}</p>
        )
      )}
      {week.note && (
        <p className="mt-1 whitespace-pre-line break-words text-[11px] leading-4 text-muted">{week.note}</p>
      )}
    </div>
  );
}

function DayCell({
  day,
  month,
  todayKey,
}: {
  day: ReleaseCalendarDay;
  month: string;
  todayKey: string;
}) {
  const today = day.date === todayKey;
  const outOfMonth = !day.date.startsWith(month);
  return (
    <div
      aria-current={today ? "date" : undefined}
      className={cn(
        "flex min-h-[4.5rem] min-w-0 flex-col gap-1.5 border-r border-border bg-card p-2 last:border-r-0",
        outOfMonth && "bg-surface-2/40",
        today && "bg-pop-soft/50"
      )}
    >
      <span
        className={cn(
          "self-start text-[11px] font-medium leading-4 text-foreground",
          outOfMonth && "text-subtle",
          today && "rounded-full bg-accent px-1.5 font-semibold text-on-fill"
        )}
      >
        {format(parseISO(day.date), "MMM d")}
      </span>
      <DayEntries groups={day.groups} />
    </div>
  );
}

/** Sheet text verbatim, in sheet order: release groups (bold heading + items) and plain lines. */
function DayEntries({ groups }: { groups: ReleaseCalendarEntryGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="min-w-0 space-y-1.5">
      {groups.map((group, i) =>
        group.heading ? (
          <div key={i}>
            <p className="break-words text-xs font-semibold leading-4 text-foreground">{group.heading}</p>
            {group.items.length > 0 && (
              <ul className="mt-0.5 space-y-0.5 border-l border-border pl-2">
                {group.items.map((item, j) => (
                  <li key={j} className="break-words text-xs leading-4 text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div key={i} className="space-y-0.5">
            {group.items.map((line, j) => (
              <p key={j} className="break-words text-xs leading-4 text-foreground">
                {line}
              </p>
            ))}
          </div>
        )
      )}
    </div>
  );
}
