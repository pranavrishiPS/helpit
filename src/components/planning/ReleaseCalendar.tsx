"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO, startOfMonth } from "date-fns";
import type { Release } from "@/lib/types";
import { Button, Card } from "@/components/ui";
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
  if (isLive) return "bg-surface-3 text-muted";
  if (platform === "android")
    return "bg-android-soft text-android-ink shadow-[inset_3px_0_0_var(--android)]";
  if (platform === "ios") return "bg-ios-soft text-ios-ink shadow-[inset_3px_0_0_var(--ios)]";
  return "bg-accent-soft text-accent";
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onMonthChange(shiftCalendarMonth(month, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onMonthChange(shiftCalendarMonth(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight />
          </Button>
          <h2 className="ml-1.5 shrink-0 font-display text-base font-semibold text-foreground">
            {format(month, "MMMM yyyy")}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted max-xl:order-last max-xl:basis-full">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-sm bg-android-soft ring-1 ring-android/40" aria-hidden />
            Android
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-sm bg-ios-soft ring-1 ring-ios/40" aria-hidden />
            iOS
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-sm bg-surface-3" aria-hidden />
            Shipped
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onJumpToday}
          aria-pressed={viewingCurrentMonth}
          className={cn("shrink-0", viewingCurrentMonth && "bg-surface-3 text-foreground")}
        >
          Today
        </Button>
      </div>

      <div className="scroll-fade-x overflow-x-auto">
        <div className="min-w-[32rem]">
          <div className="grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] border-b border-border bg-surface-2">
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

          {weeks.map((week) => (
            <div
              key={week.weekLabel}
              className="grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] border-b border-border last:border-b-0"
            >
              <div className="flex items-start justify-center border-r border-border bg-surface-2/60 py-2 text-[10px] font-semibold tabular-nums text-muted">
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
                  "mb-1 text-[11px] leading-4",
                  mutedOutOfMonth && "text-subtle",
                  day.inMonth && "font-medium text-foreground",
                  today && "rounded-full bg-accent px-1.5 font-semibold text-on-fill"
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
                      "relative flex flex-col border-r border-border p-1.5 text-left last:border-r-0",
                      mutedOutOfMonth && !hasReleases && "min-h-[2.25rem] bg-surface-2/40",
                      !mutedOutOfMonth && !hasReleases && "min-h-[3.25rem] bg-card",
                      mutedOutOfMonth && hasReleases && "bg-surface-2/40",
                      !mutedOutOfMonth && hasReleases && "min-h-[5rem] bg-card",
                      hasReleases &&
                        "cursor-pointer transition-colors hover:bg-surface-2",
                      today && !isSelectedDay && "bg-pop-soft/50",
                      isSelectedDay && "bg-accent-soft/60 hover:bg-accent-soft/60",
                      isSelectedDay &&
                        "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-signal"
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
                          "self-start rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
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
                                "block w-full overflow-hidden rounded-chip py-1 pl-2 pr-1.5 text-left transition-[box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
                                releaseBannerClass(platform, release.status === "live"),
                                isSelectedRelease && "ring-2 ring-signal ring-offset-1 ring-offset-card"
                              )}
                            >
                              <span className="flex items-center gap-1 truncate text-[11px] font-semibold leading-tight">
                                {release.status === "live" && (
                                  <Check aria-hidden="true" className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />
                                )}
                                <span className="truncate">{release.name}</span>
                              </span>
                              {items.length > 0 && (
                                <ul className="mt-0.5 space-y-px border-t border-current/15 pt-0.5">
                                  {items.slice(0, 3).map((item, itemIndex) => (
                                    <li
                                      key={`${item}-${itemIndex}`}
                                      className="truncate text-[10px] leading-snug"
                                    >
                                      {item}
                                    </li>
                                  ))}
                                  {items.length > 3 && (
                                    <li className="text-[10px] font-medium">
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
        <div className="border-t border-border bg-surface-2/60 px-3 py-2.5 sm:px-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Unscheduled</p>
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
                    "inline-flex items-center gap-1 rounded-chip py-0.5 pl-2 pr-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
                    releaseBannerClass(platform, release.status === "live"),
                    selected && "ring-2 ring-signal ring-offset-1 ring-offset-card"
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
