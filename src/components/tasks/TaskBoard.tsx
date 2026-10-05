"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecurringTask, Task } from "@/lib/types";
import { ruleSummary } from "@/lib/recurrence";
import { Button, fieldClasses } from "@/components/ui";
import { DateCommitInput } from "@/components/ui/DateCommitInput";
import { cn } from "@/lib/cn";
import {
  dayProgress,
  groupTasksByDay,
  reschedulePatch,
  splitRecentDays,
  statusPatch,
  todayKey,
} from "@/lib/task-board";
import { TaskDaySection } from "./TaskDaySection";
import type { TaskActions } from "./TaskMenus";

interface TaskBoardProps {
  /** Tasks-tab tasks only (see `getTasksTabTasks`). */
  tasks: Task[];
  /** Rules behind recurring rows; a row shows the repeat icon only while its rule exists. */
  recurringRules?: RecurringTask[];
  onAdd: (task: Partial<Task>) => Promise<boolean>;
  onUpdate: (task: Task) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

/**
 * Day-by-day Tasks tab, newest date on top: Upcoming days (latest first), Today (always shown),
 * earlier days newest first, then undated tasks. Each day is a collapsible group header above a flat four-column table.
 */
export function TaskBoard({ tasks, recurringRules, onAdd, onUpdate, onDelete }: TaskBoardProps) {
  const [today, setToday] = useState(() => todayKey());
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [showOlder, setShowOlder] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  // "Today" is re-evaluated when the tab regains focus (e.g. after midnight).
  useEffect(() => {
    const refresh = () => {
      setToday(todayKey());
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Bring a section revealed via "Go to date" into view once it has rendered.
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(`day-${scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setScrollTo(null);
  }, [scrollTo]);

  const run = useCallback(async (id: string, action: () => Promise<boolean>) => {
    setToday(todayKey());
    setPending((prev) => new Set(prev).add(id));
    try {
      return await action();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const summaries = useMemo(
    () => new Map((recurringRules ?? []).map((rule) => [rule.id, ruleSummary(rule)])),
    [recurringRules]
  );

  const actions: TaskActions = {
    today,
    pending,
    recurrenceSummary: (task) => (task.recurringId ? summaries.get(task.recurringId) : undefined),
    setStatus: (task, status) => void run(task.id, () => onUpdate(statusPatch(task, status))),
    toggleDone: (task) =>
      void run(task.id, () => onUpdate(statusPatch(task, task.status === "done" ? "todo" : "done"))),
    reschedule: (task, day) => void run(task.id, () => onUpdate(reschedulePatch(task, day))),
    remove: (task) => void run(task.id, () => onDelete(task.id)),
    // Inline edits keep the row interactive; the cell shows its own saving state.
    save: (task) => onUpdate(task),
  };

  const groups = useMemo(() => groupTasksByDay(tasks, today, revealed), [tasks, today, revealed]);
  const { recent, older } = splitRecentDays(groups.past, undefined, revealed);
  const progress = dayProgress(tasks, today);
  const allDone = progress.total > 0 && progress.done === progress.total;

  function addItem(title: string, dayKey: string | undefined): Promise<boolean> {
    setToday(todayKey());
    return onAdd({ title, status: "todo", ...(dayKey ? { dueDate: dayKey } : {}) });
  }

  function goToDate(dayKey: string) {
    setRevealed((prev) => new Set(prev).add(dayKey));
    setScrollTo(dayKey);
  }

  const renderDay = (section: (typeof groups.past)[number]) => (
    <TaskDaySection
      key={section.key}
      section={section}
      actions={actions}
      onAdd={addItem}
      emptyHint="No items yet"
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-sm:w-full sm:w-64">
          <p className="text-xs tabular-nums text-muted">
            {allDone ? (
              <span className="font-semibold text-success">All done today</span>
            ) : (
              <>
                Today:{" "}
                <span className="font-semibold text-foreground">{progress.done}</span> of{" "}
                <span className="font-semibold text-foreground">{progress.total}</span> done
              </>
            )}
          </p>
          <div
            role="progressbar"
            aria-label="Today's progress"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn("h-full rounded-full", allDone ? "bg-success" : "bg-signal")}
              style={{
                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          Go to date
          <DateCommitInput
            value=""
            aria-label="Go to date"
            className={cn(fieldClasses({ size: "sm" }), "w-auto")}
            onCommit={(value) => {
              if (value) goToDate(value);
            }}
          />
        </label>
      </div>

      {groups.upcoming.length > 0 && (
        <>
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            Upcoming
          </h2>
          {[...groups.upcoming].reverse().map(renderDay)}
        </>
      )}

      <TaskDaySection
        section={groups.today}
        isToday
        actions={actions}
        onAdd={addItem}
        emptyHint="Nothing planned for today. Add your first item below."
      />

      {recent.map(renderDay)}

      {older.length > 0 && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setShowOlder((v) => !v)}>
            {showOlder ? "Hide older days" : `Show older days (${older.length})`}
          </Button>
        </div>
      )}
      {showOlder && older.map(renderDay)}

      <TaskDaySection
        section={groups.noDate}
        actions={actions}
        onAdd={addItem}
        emptyHint="No undated items"
      />
    </div>
  );
}
