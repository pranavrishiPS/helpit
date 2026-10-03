"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO, addDays, isValid } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, PartyPopper, Users, BarChart3 } from "lucide-react";
import type { ScrumAttendanceEntry, ScrumHoliday, ScrumStatus } from "@/lib/types";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  FieldError,
  Input,
  Select,
  tableClasses,
} from "@/components/ui";
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
import { isScrumDraftDirty, scrumEntriesSignature } from "@/lib/scrum-draft";

const STATUS_PILL_CLASSES: Record<ScrumStatus, string> = {
  on_time: "bg-success-soft text-success border-success/40",
  late: "bg-caution-soft text-caution border-caution/40",
  leave: "bg-info-soft text-info border-info/40",
  first_half_off: "bg-accent-soft text-accent border-accent/40",
  other: "bg-surface-3 text-foreground border-border-strong",
};

const CALENDAR_STATUS_CLASSES: Record<ScrumStatus, string> = {
  on_time: "bg-success-soft text-success",
  late: "bg-caution-soft text-caution",
  leave: "bg-info-soft text-info",
  first_half_off: "bg-accent-soft text-accent",
  other: "bg-surface-3 text-foreground",
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
    <div className="flex basis-full flex-wrap gap-1.5 sm:basis-auto">
      {statusesForDate(date, value).map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          aria-pressed={value === status}
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-1",
            value === status
              ? STATUS_PILL_CLASSES[status]
              : "border-border bg-card text-muted hover:bg-surface-2 hover:text-foreground"
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
  // Save errors show next to the Save button (the roster below can push `error` off-screen on phones).
  const [saveError, setSaveError] = useState<string | null>(null);
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

  // Latest drafts for the seeding effect, which must not re-run on every keystroke.
  const draftRef = useRef(draft);
  const draftNotesRef = useRef(draftNotes);
  useEffect(() => {
    draftRef.current = draft;
    draftNotesRef.current = draftNotes;
  }, [draft, draftNotes]);

  // Seed drafts from saved entries when the date changes, or when the saved entries
  // for this date change while there are no unsaved edits. Store reloads (poller,
  // other mutations) hand us a new entries array and must not wipe the team's drafts.
  const seededRef = useRef<{ date: string; entries: ScrumAttendanceEntry[] } | null>(null);
  useEffect(() => {
    const prev = seededRef.current;
    seededRef.current = { date: selectedDate, entries: dayEntries };
    if (prev && prev.date === selectedDate) {
      if (scrumEntriesSignature(prev.entries) === scrumEntriesSignature(dayEntries)) return;
      // Keep the draft only if it differs from both the old and the new saved state
      // (after our own save it equals the new saved state, so it is re-seeded).
      const hasUnsaved =
        isScrumDraftDirty(draftRef.current, draftNotesRef.current, prev.entries) &&
        isScrumDraftDirty(draftRef.current, draftNotesRef.current, dayEntries);
      if (hasUnsaved) return;
    }
    const next: Record<string, ScrumStatus> = {};
    const nextNotes: Record<string, string> = {};
    for (const entry of dayEntries) {
      next[entry.member] = entry.status;
      if (entry.note) nextNotes[entry.member] = entry.note;
    }
    setDraft(next);
    setDraftNotes(nextNotes);
    setError(null);
    setSaveError(null);
  }, [dayEntries, selectedDate]);

  function shiftDate(days: number) {
    const current = parseISO(selectedDate);
    if (!isValid(current)) return;
    setSelectedDate(format(addDays(current, days), "yyyy-MM-dd"));
  }

  async function handleSave() {
    // Entries for members removed from the roster stay in the draft (they're on this date's
    // saved data) but the server only accepts roster members, so leave them out of the save.
    const roster = new Set(members.map((m) => m.toLowerCase()));
    const toSave = Object.entries(draft)
      .filter(([member]) => roster.has(member.toLowerCase()))
      .map(([member, status]) => ({
        member,
        status,
        note: status === "other" ? draftNotes[member]?.trim() || undefined : undefined,
      }));
    if (toSave.length === 0) return;
    setSaving(true);
    setError(null);
    setSaveError(null);
    try {
      await upsertScrumAttendance(selectedDate, toSave);
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save attendance");
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

  const dirty = useMemo(
    () => isScrumDraftDirty(draft, draftNotes, dayEntries),
    [draft, draftNotes, dayEntries]
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => shiftDate(-1)} aria-label="Previous day">
              <ChevronLeft />
            </Button>
            <Input
              size="sm"
              type="date"
              aria-label="Attendance date"
              value={selectedDate}
              onChange={(e) => {
                // Clearing the input yields "" — keep the current date instead of an invalid one.
                if (e.target.value && isValid(parseISO(e.target.value))) {
                  setSelectedDate(e.target.value);
                }
              }}
              className="w-auto"
            />
            <Button variant="ghost" size="icon" onClick={() => shiftDate(1)} aria-label="Next day">
              <ChevronRight />
            </Button>
            {selectedDate !== todayIso() && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(todayIso())}>
                Today
              </Button>
            )}
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty || !!todaysHoliday}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        {saveError && (
          <FieldError className="mb-3 mt-0">{saveError}</FieldError>
        )}

        {recentDates.length > 0 && (
          <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
            {recentDates.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                aria-pressed={date === selectedDate}
                className={cn(
                  "h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
                  date === selectedDate
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-muted ring-1 ring-inset ring-border hover:text-foreground"
                )}
              >
                {format(parseISO(date), "d MMM")}
              </button>
            ))}
          </div>
        )}

        {todaysHoliday ? (
          <Alert
            tone="pop"
            icon={PartyPopper}
            className="mb-3 items-center"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveHoliday(selectedDate)}
                className="-my-1 h-7 shrink-0 text-pop-ink hover:bg-pop/15 hover:text-pop-ink"
              >
                Unmark
              </Button>
            }
          >
            {todaysHoliday.label || "Holiday"} — no attendance is tracked on this date.
          </Alert>
        ) : addingHoliday ? (
          <form
            onSubmit={handleAddHoliday}
            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2/70 p-2.5"
          >
            <Input
              size="sm"
              type="date"
              aria-label="Holiday date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              className="w-auto"
            />
            <Input
              size="sm"
              value={holidayLabel}
              onChange={(e) => setHolidayLabel(e.target.value)}
              placeholder="Label (optional)"
              aria-label="Holiday label"
              className="min-w-0 flex-1"
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
            className="mb-3 rounded-md text-xs font-medium text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            + Mark this date as a holiday (clears any attendance logged for it)
          </button>
        )}

        {todaysHoliday ? null : members.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No teammates yet"
            description="Add teammates below to start logging daily scrum attendance."
          />
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="w-32 shrink-0 truncate text-sm font-semibold text-foreground sm:w-40">
                  {member}
                </span>
                <StatusPills
                  value={draft[member]}
                  date={selectedDate}
                  onChange={(status) => setDraft((prev) => ({ ...prev, [member]: status }))}
                />
                {draft[member] === "other" && (
                  <Input
                    size="sm"
                    aria-label={`Comment for ${member}`}
                    value={draftNotes[member] ?? ""}
                    onChange={(e) =>
                      setDraftNotes((prev) => ({ ...prev, [member]: e.target.value }))
                    }
                    placeholder="Comment, e.g. Workshop"
                    className="min-w-[10rem] flex-1"
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <FieldError className="mt-2">{error}</FieldError>}

        <form onSubmit={handleAddMember} className="mt-4 flex gap-2 border-t border-border pt-4">
          <Input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="Add teammate to roster"
            aria-label="Add teammate to roster"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" disabled={addingMember || !newMember.trim()}>
            <Plus />
            Add
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          module="scrum"
          icon={BarChart3}
          title="Individual insights"
          action={
          <Select
            size="sm"
            aria-label="Month"
            value={monthKey}
            onChange={(e) => setSelectedMonth(parseISO(`${e.target.value}-01`))}
            className="w-auto"
          >
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {format(parseISO(`${key}-01`), "MMMM yyyy")}
              </option>
            ))}
          </Select>
          }
        />
        {insights.length === 0 ? (
          <EmptyState compact icon={BarChart3} title="No attendance logged this month." />
        ) : (
          <div className={tableClasses.wrapper}>
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className={tableClasses.headRow}>
                  <th className={tableClasses.cell}>Member</th>
                  <th className={cn(tableClasses.cell, "text-right")}>On time</th>
                  <th className={cn(tableClasses.cell, "text-right")}>Late</th>
                  <th className={cn(tableClasses.cell, "text-right")}>Leave</th>
                  <th className={cn(tableClasses.cell, "text-right")}>1st half off</th>
                </tr>
              </thead>
              <tbody>
                {insights.map((row) => (
                  <tr
                    key={row.member}
                    onClick={() => setSelectedMember(row.member)}
                    aria-selected={selectedMember === row.member}
                    className={cn(
                      tableClasses.row,
                      "cursor-pointer",
                      selectedMember === row.member && tableClasses.selectedRow
                    )}
                  >
                    <td className={cn(tableClasses.cell, "font-semibold text-foreground")}>{row.member}</td>
                    <td className={cn(tableClasses.cell, "text-right font-semibold tabular-nums text-success")}>
                      {row.totalDays > 0 ? `${row.onTimeRate}%` : "—"}
                    </td>
                    <td className={cn(tableClasses.cell, "text-right tabular-nums text-muted")}>
                      {row.late}/{row.totalDays}
                    </td>
                    <td className={cn(tableClasses.cell, "text-right tabular-nums text-muted")}>
                      {row.leave}/{row.totalDays}
                    </td>
                    <td className={cn(tableClasses.cell, "text-right tabular-nums text-muted")}>
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedMonth((m) => shiftCalendarMonth(m, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedMonth((m) => shiftCalendarMonth(m, 1))}
                aria-label="Next month"
              >
                <ChevronRight />
              </Button>
              <h2 className="ml-1.5 font-display text-base font-semibold text-foreground">
                {selectedMember} · {format(selectedMonth, "MMMM yyyy")}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
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
                <span className="h-2 w-3.5 rounded-sm bg-pop-soft ring-1 ring-pop/30" aria-hidden />
                Holiday
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-3.5 rounded-sm bg-surface-2 ring-1 ring-border" aria-hidden />
                NA
              </span>
            </div>
          </div>

          <div className="scroll-fade-x overflow-x-auto">
            <div className="min-w-[28rem]">
              <div className="grid grid-cols-5 border-b border-border bg-surface-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((label) => (
                  <div
                    key={label}
                    className="border-r border-border py-2 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted last:border-r-0"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {calendarWeeks.map((week) => (
                <div
                  key={week.weekLabel}
                  className="grid grid-cols-5 border-b border-border last:border-b-0"
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
                          "flex min-h-[3.25rem] flex-col gap-1 border-r border-border p-1.5 last:border-r-0",
                          mutedOutOfMonth ? "bg-surface-2/40" : "bg-card",
                          today && "bg-pop-soft/50"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[11px] leading-5",
                            mutedOutOfMonth && "text-subtle",
                            day.inMonth && "font-medium text-foreground",
                            today &&
                              "grid h-5 w-5 place-items-center rounded-full bg-accent font-semibold leading-none text-white"
                          )}
                        >
                          {format(day.date, "d")}
                        </span>
                        {!mutedOutOfMonth && (
                          <span
                            className={cn(
                              "inline-flex w-fit items-center rounded-chip px-1.5 py-0.5 text-[11px] font-semibold",
                              dayEntry
                                ? CALENDAR_STATUS_CLASSES[dayEntry.status]
                                : holiday
                                  ? "bg-pop-soft text-pop-ink"
                                  : "bg-surface-2 text-subtle"
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
