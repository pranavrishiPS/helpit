"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO, startOfMonth } from "date-fns";
import type { Release } from "@/lib/types";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getReleasePlatform, parseSprintItems } from "@/lib/utils";
import {
  buildWorkWeeks,
  groupReleasesByCalendarDate,
  getUndatedReleases,
  isCalendarDayToday,
  shiftCalendarMonth,
} from "@/lib/release-calendar";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

interface ReleaseCalendarProps {
  releases: Release[];
  month: Date;
  onMonthChange: (month: Date) => void;
  onJumpToday: () => void;
  selectedReleaseId?: string;
  selectedDateKey?: string;
  onSelectRelease: (release: Release) => void;
  onSelectDate: (dateKey: string, releases: Release[]) => void;
}

function releaseBannerClass(
  platform: ReturnType<typeof getReleasePlatform>,
  isLive: boolean
): string {
  if (isLive) return "bg-slate-200/90 text-slate-800";
  if (platform === "android") return "bg-emerald-200/90 text-emerald-950";
  if (platform === "ios") return "bg-sky-200/90 text-sky-950";
  return "bg-accent/15 text-accent";
}

export function ReleaseCalendar({
  releases,
  month,
  onMonthChange,
  onJumpToday,
  selectedReleaseId,
  selectedDateKey,
  onSelectRelease,
  onSelectDate,
}: ReleaseCalendarProps) {
  const weeks = buildWorkWeeks(month);
  const byDate = groupReleasesByCalendarDate(releases);
  const undated = getUndatedReleases(releases);
  const viewingCurrentMonth =
    format(month, "yyyy-MM") === format(startOfMonth(new Date()), "yyyy-MM");

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMonthChange(shiftCalendarMonth(month, -1))}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(shiftCalendarMonth(month, 1))}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="ml-1 truncate text-sm font-semibold text-foreground">
            {format(month, "MMMM yyyy")}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-3.5 rounded-sm bg-emerald-200" aria-hidden />
            Android
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3.5 rounded-sm bg-sky-200" aria-hidden />
            iOS
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3.5 rounded-sm bg-slate-200" aria-hidden />
            Shipped
          </span>
        </div>

        <button
          type="button"
          onClick={onJumpToday}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            viewingCurrentMonth
              ? "bg-slate-100 text-foreground"
              : "text-muted hover:bg-slate-100 hover:text-foreground"
          )}
        >
          Today
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[36rem]">
          <div className="grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] border-b border-border/80 bg-slate-50/90">
            <div className="border-r border-border/60 py-2 text-center text-[9px] font-semibold uppercase tracking-wide text-muted">
              Wk
            </div>
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="border-r border-border/60 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week) => (
            <div
              key={week.weekLabel}
              className="grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] border-b border-border/80 last:border-b-0"
            >
              <div className="flex items-start justify-center border-r border-border/60 bg-slate-50/50 py-2 text-[9px] font-semibold tabular-nums text-muted">
                {week.weekLabel.replace("Week ", "")}
              </div>

              {week.days.map((day) => {
                const dayReleases = byDate.get(day.key) ?? [];
                const isSelectedDay =
                  selectedDateKey === day.key ||
                  (selectedReleaseId &&
                    dayReleases.some((r) => r.id === selectedReleaseId));
                const today = isCalendarDayToday(day);
                const hasReleases = dayReleases.length > 0;
                const mutedOutOfMonth = !day.inMonth;
                const dayLabelClass = cn(
                  "mb-0.5 text-[10px] leading-none",
                  mutedOutOfMonth && "text-muted/45",
                  day.inMonth && "font-medium text-foreground",
                  today && "font-semibold text-brand"
                );
                const dayLabelText = format(day.date, mutedOutOfMonth ? "d" : "MMM d");

                // The cell is a div (release buttons live inside it, so it can't be a button);
                // the day label is the keyboard-accessible control for selecting the day.
                return (
                  <div
                    key={day.key}
                    onClick={
                      hasReleases
                        ? () => onSelectDate(day.key, dayReleases)
                        : undefined
                    }
                    aria-current={today ? "date" : undefined}
                    className={cn(
                      "relative flex flex-col border-r border-border/60 p-1.5 text-left last:border-r-0",
                      mutedOutOfMonth && !hasReleases && "min-h-[2.25rem] bg-slate-50/30",
                      !mutedOutOfMonth && !hasReleases && "min-h-[3.25rem] bg-white",
                      mutedOutOfMonth && hasReleases && "bg-slate-50/50",
                      !mutedOutOfMonth && hasReleases && "min-h-[5rem] bg-white",
                      isSelectedDay && "bg-slate-100/80",
                      today && !isSelectedDay && "bg-amber-50/40",
                      isSelectedDay &&
                        "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent/70",
                      hasReleases &&
                        "cursor-pointer transition-colors hover:bg-slate-50"
                    )}
                  >
                    {hasReleases ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDate(day.key, dayReleases);
                        }}
                        aria-pressed={!!isSelectedDay}
                        aria-label={formatCalendarDayLabel(day.key)}
                        className={cn(
                          dayLabelClass,
                          "self-start text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/30"
                        )}
                      >
                        {dayLabelText}
                      </button>
                    ) : (
                      <span className={dayLabelClass}>{dayLabelText}</span>
                    )}

                    {hasReleases && (
                      <div className="space-y-1">
                        {dayReleases.map((release) => {
                          const platform = getReleasePlatform(release);
                          const items = parseSprintItems(release.notes);
                          const isSelectedRelease = release.id === selectedReleaseId;

                          return (
                            <button
                              key={release.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRelease(release);
                              }}
                              className={cn(
                                "block w-full overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm transition-[box-shadow,ring-color]",
                                releaseBannerClass(platform, release.status === "live"),
                                isSelectedRelease && "ring-1 ring-inset ring-foreground/25"
                              )}
                            >
                              <span className="block truncate text-[10px] font-semibold leading-tight">
                                {release.name}
                              </span>
                              {items.length > 0 && (
                                <ul className="mt-0.5 space-y-px border-t border-black/[0.06] pt-0.5">
                                  {items.slice(0, 3).map((item, itemIndex) => (
                                    <li
                                      key={`${item}-${itemIndex}`}
                                      className="truncate text-[9px] leading-snug opacity-90"
                                    >
                                      {item}
                                    </li>
                                  ))}
                                  {items.length > 3 && (
                                    <li className="text-[9px] opacity-75">
                                      +{items.length - 3} more
                                    </li>
                                  )}
                                </ul>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="border-t border-border/80 bg-slate-50/40 px-3 py-2 sm:px-4">
          <p className="mb-1.5 text-[10px] font-medium text-muted">Unscheduled</p>
          <div className="flex flex-wrap gap-1">
            {undated.map((release) => {
              const platform = getReleasePlatform(release);
              const selected = release.id === selectedReleaseId;
              return (
                <button
                  key={release.id}
                  type="button"
                  onClick={() => onSelectRelease(release)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                    releaseBannerClass(platform, release.status === "live"),
                    selected && "ring-1 ring-inset ring-foreground/20"
                  )}
                >
                  {release.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

export function formatCalendarDayLabel(dateKey: string): string {
  return format(parseISO(dateKey), "EEE, d MMM yyyy");
}

export function isCurrentMonth(month: Date): boolean {
  const today = startOfMonth(new Date());
  return format(month, "yyyy-MM") === format(today, "yyyy-MM");
}
