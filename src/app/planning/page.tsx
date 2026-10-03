"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Plus } from "lucide-react";
import { startOfMonth, isSameMonth, parseISO } from "date-fns";
import { PageHeader, Card, Badge, Button, EmptyState, ErrorBanner, PageSkeleton } from "@/components/ui";
import { useDashboard } from "@/lib/use-dashboard";
import { ReleaseCard } from "@/components/planning/ReleaseCard";
import {
  ReleaseCalendar,
  formatCalendarDayLabel,
} from "@/components/planning/ReleaseCalendar";
import { NewReleaseDialog } from "@/components/planning/NewReleaseDialog";
import { notifyStoreUpdated } from "@/lib/store-events";
import { updateRelease } from "@/lib/api-client";
import { findDefaultRelease, getReleaseCalendarDate } from "@/lib/release-calendar";
import type { Release } from "@/lib/types";

export default function PlanningPage() {
  const { store, loading, error, clearError, reload } = useDashboard();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | undefined>();
  const [selectedDateKey, setSelectedDateKey] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);

  const releases = useMemo(() => store?.releases ?? [], [store?.releases]);

  const selectedRelease = useMemo(
    () => releases.find((r) => r.id === selectedReleaseId),
    [releases, selectedReleaseId]
  );

  useEffect(() => {
    if (loading || !store || selectedReleaseId) return;
    const defaultRelease = findDefaultRelease(releases, calendarMonth);
    if (defaultRelease) {
      setSelectedReleaseId(defaultRelease.id);
      setSelectedDateKey(getReleaseCalendarDate(defaultRelease));
    }
  }, [loading, store, releases, calendarMonth, selectedReleaseId]);

  async function handleReleaseUpdate(
    id: string,
    updates: Parameters<typeof updateRelease>[1]
  ) {
    setActionError(null);
    try {
      await updateRelease(id, updates);
    } catch (err) {
      // Nothing was saved; the card still shows the stored values.
      setActionError(err instanceof Error ? err.message : "Failed to update release");
      return;
    }
    await reload();
    notifyStoreUpdated();

    if (updates.targetDate !== undefined) {
      const nextKey = updates.targetDate ?? undefined;
      setSelectedDateKey(nextKey);
      if (nextKey) {
        setCalendarMonth(startOfMonth(parseISO(nextKey)));
      }
    } else if (updates.actualDate !== undefined && selectedRelease?.status === "live") {
      const nextKey = updates.actualDate ?? selectedRelease.targetDate;
      setSelectedDateKey(nextKey);
      if (nextKey) {
        setCalendarMonth(startOfMonth(parseISO(nextKey)));
      }
    }
  }

  function handleMonthChange(month: Date) {
    setCalendarMonth(month);
    const inMonth = releases
      .map((r) => ({ release: r, date: getReleaseCalendarDate(r) }))
      .filter((entry): entry is { release: Release; date: string } => !!entry.date)
      .filter((entry) => isSameMonth(parseISO(entry.date), month))
      .sort((a, b) => a.date.localeCompare(b.date));

    const pick =
      inMonth.find((entry) => entry.release.status !== "live")?.release ??
      inMonth[0]?.release;

    if (pick) {
      setSelectedReleaseId(pick.id);
      setSelectedDateKey(getReleaseCalendarDate(pick));
    } else {
      setSelectedReleaseId(undefined);
      setSelectedDateKey(undefined);
    }
  }

  function handleSelectRelease(release: Release) {
    setSelectedReleaseId(release.id);
    setSelectedDateKey(getReleaseCalendarDate(release));
    const date = getReleaseCalendarDate(release);
    if (date) {
      setCalendarMonth(startOfMonth(parseISO(date)));
    }
  }

  function handleSelectDate(dateKey: string, dayReleases: Release[]) {
    setSelectedDateKey(dateKey);
    if (dayReleases.length > 0) {
      const keepCurrent =
        selectedReleaseId && dayReleases.some((r) => r.id === selectedReleaseId);
      setSelectedReleaseId(keepCurrent ? selectedReleaseId : dayReleases[0].id);
    }
  }

  function handleJumpToday() {
    const today = startOfMonth(new Date());
    setCalendarMonth(today);
    const inMonth = releases.filter((r) => {
      const d = getReleaseCalendarDate(r);
      return d && isSameMonth(parseISO(d), today);
    });
    const pick =
      inMonth.find((r) => r.status !== "live") ??
      inMonth[0] ??
      findDefaultRelease(releases, today);
    if (pick) {
      setSelectedReleaseId(pick.id);
      setSelectedDateKey(getReleaseCalendarDate(pick));
    }
  }

  if (loading) {
    return <PageSkeleton label="Loading planning..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load planning"} />;
  }

  const inFlight = releases.filter((r) => r.status !== "live");
  const monthCount = releases.filter((r) => {
    const d = getReleaseCalendarDate(r);
    return d && isSameMonth(parseISO(d), calendarMonth);
  }).length;

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      <PageHeader
        title="Planning"
        module="planning"
        description="Mon–Fri release calendar"
        action={
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
            <Plus />
            New release
          </Button>
        }
      />

      <NewReleaseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={async () => {
          await reload();
          notifyStoreUpdated();
        }}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge tone="neutral">
          <strong className="tabular-nums text-foreground">{inFlight.length}</strong> in flight
        </Badge>
        <Badge tone="neutral">
          <strong className="tabular-nums text-foreground">{monthCount}</strong> this month
        </Badge>
        {inFlight.filter((r) => r.blockers.length > 0).length > 0 && (
          <Badge tone="danger" dot>
            <strong className="tabular-nums">
              {inFlight.filter((r) => r.blockers.length > 0).length}
            </strong>{" "}
            with blockers
          </Badge>
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ReleaseCalendar
          releases={releases}
          month={calendarMonth}
          onMonthChange={handleMonthChange}
          onJumpToday={handleJumpToday}
          selectedReleaseId={selectedReleaseId}
          selectedDateKey={selectedDateKey}
          onSelectRelease={handleSelectRelease}
          onSelectDate={handleSelectDate}
        />

        <aside className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-5.5rem)] xl:overflow-y-auto xl:overscroll-contain">
          {selectedRelease ? (
            <ReleaseCard
              key={selectedRelease.id}
              release={selectedRelease}
              detailPanel
              detailDateLabel={
                selectedDateKey ? formatCalendarDayLabel(selectedDateKey) : undefined
              }
              onUpdate={(updates) => handleReleaseUpdate(selectedRelease.id, updates)}
            />
          ) : (
            <Card>
              <EmptyState
                compact
                icon={CalendarRange}
                title="Select a release"
                description="Click any day with a release to see details."
              />
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
