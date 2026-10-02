"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO, addDays } from "date-fns";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { ScrumAttendanceEntry, ScrumHoliday, ScrumStatus } from "@/lib/types";
import { Button, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  SCRUM_STATUSES,
  SCRUM_STATUS_LABELS,
  computeScrumInsights,
  entriesByDateForMember,
  entriesForDate,
  entriesForMonth,
  holidayForDate,
  listAttendanceMonths,
  listScrumDates,
  statusesForDate,
} from "@/lib/scrum-attendance";
import {
  buildWorkWeeks,
  isCalendarDayToday,
  shiftCalendarMonth,
} from "@/lib/release-calendar";
import {
  addScrumHoliday,
  addScrumMember,
  removeScrumHoliday,
  upsertScrumAttendance,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";

const STATUS_PILL_CLASSES: Record<ScrumStatus, string> = {
  on_time: "border-accent bg-accent/10 text-accent",
  late: "border-warning bg-warning/10 text-warning",
  leave: "border-accent-secondary bg-accent-secondary/10 text-accent-secondary",
  first_half_off: "border-sky-300 bg-sky-50 text-sky-700",
  other: "border-slate-300 bg-slate-100 text-slate-700",
};

const CALENDAR_STATUS_CLASSES: Record<ScrumStatus, string> = {
  on_time: "bg-accent/15 text-accent",
  late: "bg-warning/15 text-warning",
  leave: "bg-accent-secondary/15 text-accent-secondary",
  first_half_off: "bg-sky-100 text-sky-700",
  other: "bg-slate-200/80 text-slate-700",
};

function todayIso(): string {
  // Local calendar date — toISOString() is UTC and lags a day for IST mornings.
  return format(new Date(), "yyyy-MM-dd");
}

function StatusPills({
  value,
  date,
  onChange,
}: {
  value: ScrumStatus | undefined;
  date: string;
  onChange: (status: ScrumStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {statusesForDate(date, value).map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
            value === status
              ? STATUS_PILL_CLASSES[status]
              : "border-border bg-white text-muted hover:bg-slate-50"
          )}
        >
          {SCRUM_STATUS_LABELS[status]}
        </button>
      ))}
    </div>
  );
}

export function ScrumAttendanceBoard({
  members,
  entries,
  holidays,
  onChanged,
}: {
  members: string[];
  entries: ScrumAttendanceEntry[];
  holidays: ScrumHoliday[];
  onChanged: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [draft, setDraft] = useState<Record<string, ScrumStatus>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMember, setNewMember] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [holidayDate, setHolidayDate] = useState(todayIso());
  const [holidayLabel, setHolidayLabel] = useState("");
  const [savingHoliday, setSavingHoliday] = useState(false);

  const todaysHoliday = holidayForDate(holidays, selectedDate);

  const dayEntries = useMemo(
    () => entriesForDate(entries, selectedDate),
    [entries, selectedDate]
  );
  const recentDates = useMemo(() => listScrumDates(entries).slice(0, 10), [entries]);

  const monthKey = format(selectedMonth, "yyyy-MM");
  const monthOptions = useMemo(() => {
    const currentKey = format(new Date(), "yyyy-MM");
    return [...new Set([currentKey, monthKey, ...listAttendanceMonths(entries)])].sort().reverse();
  }, [entries, monthKey]);
  const monthEntries = useMemo(() => entriesForMonth(entries, monthKey), [entries, monthKey]);
  const insights = useMemo(
    () => computeScrumInsights(members, monthEntries).sort((a, b) => b.onTimeRate - a.onTimeRate),
    [members, monthEntries]
  );

  useEffect(() => {
    if (selectedMember && insights.some((i) => i.member === selectedMember)) return;
    setSelectedMember(insights[0]?.member ?? null);
  }, [insights, selectedMember]);

  const calendarEntries = useMemo(
    () =>
      selectedMember
        ? entriesByDateForMember(entries, selectedMember)
        : new Map<string, ScrumAttendanceEntry>(),
    [entries, selectedMember]
  );
  const calendarWeeks = useMemo(() => buildWorkWeeks(selectedMonth), [selectedMonth]);

  useEffect(() => {
    const next: Record<string, ScrumStatus> = {};
    const nextNotes: Record<string, string> = {};
    for (const entry of dayEntries) {
      next[entry.member] = entry.status;
      if (entry.note) nextNotes[entry.member] = entry.note;
    }
    setDraft(next);
    setDraftNotes(nextNotes);
    setError(null);
  }, [dayEntries]);

  function shiftDate(days: number) {
    setSelectedDate(format(addDays(parseISO(selectedDate), days), "yyyy-MM-dd"));
  }

  async function handleSave() {
    const toSave = Object.entries(draft).map(([member, status]) => ({
      member,
      status,
      note: status === "other" ? draftNotes[member]?.trim() || undefined : undefined,
    }));
    if (toSave.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await upsertScrumAttendance(selectedDate, toSave);
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const name = newMember.trim();
    if (!name) return;
    setAddingMember(true);
    setError(null);
    try {
      await addScrumMember(name);
      setNewMember("");
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    setSavingHoliday(true);
    setError(null);
    try {
      await addScrumHoliday(holidayDate, holidayLabel.trim() || undefined);
      setHolidayLabel("");
      setAddingHoliday(false);
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add holiday");
    } finally {
      setSavingHoliday(false);
    }
  }

  async function handleRemoveHoliday(date: string) {
    setError(null);
    try {
      await removeScrumHoliday(date);
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove holiday");
    }
  }

  const dirty = useMemo(() => {
    if (Object.keys(draft).length !== dayEntries.length) return true;
    return dayEntries.some((e) => draft[e.member] !== e.status);
  }, [draft, dayEntries]);

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-foreground"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-foreground"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {selectedDate !== todayIso() && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayIso())}
                className="ml-1 text-xs font-medium text-accent hover:underline"
              >
                Today
              </button>
            )}
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty || !!todaysHoliday}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        {recentDates.length > 0 && (
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
            {recentDates.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium",
                  date === selectedDate
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-white text-muted hover:bg-slate-50"
                )}
              >
                {format(parseISO(date), "d MMM")}
              </button>
            ))}
          </div>
        )}

        {todaysHoliday ? (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>
              {todaysHoliday.label || "Holiday"} — no attendance is tracked on this date.
            </span>
            <button
              type="button"
              onClick={() => handleRemoveHoliday(selectedDate)}
              className="shrink-0 font-medium text-slate-500 hover:text-warning"
            >
              Unmark
            </button>
          </div>
        ) : addingHoliday ? (
          <form
            onSubmit={handleAddHoliday}
            className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-slate-50 p-2"
          >
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              className="rounded-md border border-border bg-white px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <input
              value={holidayLabel}
              onChange={(e) => setHolidayLabel(e.target.value)}
              placeholder="Label (optional)"
              className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <Button type="submit" size="sm" disabled={savingHoliday}>
              {savingHoliday ? "Saving…" : "Mark holiday"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddingHoliday(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setHolidayDate(selectedDate);
              setAddingHoliday(true);
            }}
            className="mb-3 text-xs font-medium text-muted hover:text-accent"
          >
            + Mark this date as a holiday (clears any attendance logged for it)
          </button>
        )}

        {todaysHoliday ? null : members.length === 0 ? (
          <EmptyState
            title="No teammates yet"
            description="Add teammates below to start logging daily scrum attendance."
          />
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-28 shrink-0 truncate text-sm font-medium text-foreground">
                  {member}
                </span>
                <StatusPills
                  value={draft[member]}
                  date={selectedDate}
                  onChange={(status) => setDraft((prev) => ({ ...prev, [member]: status }))}
                />
                {draft[member] === "other" && (
                  <input
                    value={draftNotes[member] ?? ""}
                    onChange={(e) =>
                      setDraftNotes((prev) => ({ ...prev, [member]: e.target.value }))
                    }
                    placeholder="Comment, e.g. Workshop"
                    className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1 text-xs outline-none focus:border-accent"
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-2 text-sm text-warning">{error}</p>}

        <form onSubmit={handleAddMember} className="mt-4 flex gap-2 border-t border-border pt-3">
          <input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="Add teammate to roster"
            className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={addingMember || !newMember.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </form>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Individual insights</h2>
          <select
            value={monthKey}
            onChange={(e) => setSelectedMonth(parseISO(`${e.target.value}-01`))}
            className="rounded-md border border-border bg-white px-2 py-1 text-xs outline-none focus:border-accent"
          >
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {format(parseISO(`${key}-01`), "MMMM yyyy")}
              </option>
            ))}
          </select>
        </div>
        {insights.length === 0 ? (
          <p className="text-sm text-muted">No attendance logged this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="pb-1 pr-2 font-medium">Member</th>
                  <th className="pb-1 px-2 font-medium">On time</th>
                  <th className="pb-1 px-2 font-medium">Late</th>
                  <th className="pb-1 px-2 font-medium">Leave</th>
                  <th className="pb-1 pl-2 font-medium">1st half off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {insights.map((row) => (
                  <tr
                    key={row.member}
                    onClick={() => setSelectedMember(row.member)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-slate-50",
                      selectedMember === row.member && "bg-accent/5"
                    )}
                  >
                    <td className="py-1 pr-2 font-medium text-foreground">{row.member}</td>
                    <td className="px-2 py-1 tabular-nums font-medium text-accent">
                      {row.totalDays > 0 ? `${row.onTimeRate}%` : "—"}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-muted">
                      {row.late}/{row.totalDays}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-muted">
                      {row.leave}/{row.totalDays}
                    </td>
                    <td className="py-1 pl-2 tabular-nums text-muted">
                      {row.firstHalfOff}/{row.totalDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedMember && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftCalendarMonth(m, -1))}
                className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-foreground"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftCalendarMonth(m, 1))}
                className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-foreground"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <h2 className="ml-1 text-sm font-semibold text-foreground">
                {selectedMember} · {format(selectedMonth, "MMMM yyyy")}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted">
              {SCRUM_STATUSES.map((status) => (
                <span key={status} className="flex items-center gap-1">
                  <span
                    className={cn("h-2 w-3.5 rounded-sm", CALENDAR_STATUS_CLASSES[status])}
                    aria-hidden
                  />
                  {SCRUM_STATUS_LABELS[status]}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2 w-3.5 rounded-sm bg-indigo-100 border border-indigo-200" aria-hidden />
                Holiday
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-3.5 rounded-sm bg-slate-50 border border-border" aria-hidden />
                NA
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[28rem]">
              <div className="grid grid-cols-5 border-b border-border/80 bg-slate-50/90">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((label) => (
                  <div
                    key={label}
                    className="border-r border-border/60 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted last:border-r-0"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {calendarWeeks.map((week) => (
                <div
                  key={week.weekLabel}
                  className="grid grid-cols-5 border-b border-border/80 last:border-b-0"
                >
                  {week.days.map((day) => {
                    const dayEntry = calendarEntries.get(day.key);
                    const holiday = holidayForDate(holidays, day.key);
                    const today = isCalendarDayToday(day);
                    const mutedOutOfMonth = !day.inMonth;

                    return (
                      <div
                        key={day.key}
                        title={dayEntry?.note ?? holiday?.label}
                        className={cn(
                          "flex min-h-[3.25rem] flex-col gap-1 border-r border-border/60 p-1.5 last:border-r-0",
                          mutedOutOfMonth ? "bg-slate-50/30" : "bg-white",
                          today && "bg-amber-50/40"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[10px] leading-none",
                            mutedOutOfMonth && "text-muted/45",
                            day.inMonth && "font-medium text-foreground",
                            today && "font-semibold text-brand"
                          )}
                        >
                          {format(day.date, "d")}
                        </span>
                        {!mutedOutOfMonth && (
                          <span
                            className={cn(
                              "inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                              dayEntry
                                ? CALENDAR_STATUS_CLASSES[dayEntry.status]
                                : holiday
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-slate-50 text-muted/70"
                            )}
                          >
                            {dayEntry
                              ? SCRUM_STATUS_LABELS[dayEntry.status]
                              : holiday
                                ? "Holiday"
                                : "NA"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
