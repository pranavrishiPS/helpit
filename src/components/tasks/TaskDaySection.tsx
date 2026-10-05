"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { Task } from "@/lib/types";
import { Badge, checkboxClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { commentPatch, formatDayChip, titlePatch, type DaySection } from "@/lib/task-board";
import { AddItem } from "./TaskAddItem";
import { EditableText } from "./TaskEditableText";
import { RowMenu, StatusMenu, type TaskActions } from "./TaskMenus";

// Flat table cells: 1px vertical dividers between columns (sm+), hover highlight per cell.
const CELL = "align-top sm:border-l sm:border-border sm:first:border-l-0 sm:hover:bg-surface-2";
const HEAD =
  "h-8 px-2 text-left align-middle text-xs font-medium text-muted sm:border-l sm:border-border sm:first:border-l-0";

/**
 * One day as a GitHub-Projects-style group: a slim header line (collapse chevron, date, count)
 * above a flat four-column table (S. No., Items, Status, Comments) that ends in a muted
 * "+ Add item" row. Rows turn into compact stacked rows below `sm`.
 */
export function TaskDaySection({
  section,
  isToday,
  actions,
  onAdd,
  emptyHint,
}: {
  section: DaySection;
  isToday?: boolean;
  actions: TaskActions;
  /** Creates a task due on this section's day (no date for the No date section). */
  onAdd: (title: string, dayKey: string | undefined) => Promise<boolean>;
  emptyHint: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = section.dayKey ? formatDayChip(section.dayKey) : "No date";
  const headingId = `heading-${section.key}`;
  const bodyId = useId();
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <section id={`day-${section.key}`} aria-labelledby={headingId} className="scroll-mt-20">
      <div className="mb-1 flex h-8 items-center gap-2">
        <h2 id={headingId} className="min-w-0 font-display text-sm font-semibold text-foreground">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            className="-ml-1 flex h-7 items-center gap-1.5 rounded-chip px-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <Chevron aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
            <span>{label}</span>
            <span
              aria-label={`${section.tasks.length} ${section.tasks.length === 1 ? "item" : "items"}`}
              className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium leading-4 tabular-nums text-muted"
            >
              {section.tasks.length}
            </span>
          </button>
        </h2>
        {isToday && <Badge tone="accent">Today</Badge>}
      </div>

      <div
        id={bodyId}
        hidden={collapsed}
        className="overflow-x-auto border-y border-border bg-card"
      >
        <table className="w-full table-fixed text-sm max-sm:block sm:min-w-[40rem]">
          <caption className="sr-only">{`Tasks for ${label}`}</caption>
          <thead className="max-sm:hidden">
            <tr className="bg-surface-2">
              <th scope="col" className={cn(HEAD, "w-14 text-center")}>S. No.</th>
              <th scope="col" className={cn(HEAD, "w-[40%]")}>Items</th>
              <th scope="col" className={cn(HEAD, "w-40")}>Status</th>
              <th scope="col" className={HEAD}>Comments</th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {section.tasks.length === 0 && (
              <tr className="border-t border-border max-sm:block">
                <td colSpan={4} className="px-2 py-2 text-center text-xs text-muted max-sm:block">
                  {emptyHint}
                </td>
              </tr>
            )}
            {section.tasks.map((task, index) => (
              <TaskRow key={task.id} task={task} number={index + 1} actions={actions} />
            ))}
            <tr className="border-t border-border max-sm:block">
              <td colSpan={4} className="p-0 max-sm:block">
                <AddItem
                  ariaLabel={`Add item to ${label}`}
                  onAdd={(title) => onAdd(title, section.dayKey)}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TaskRow({
  task,
  number,
  actions,
}: {
  task: Task;
  number: number;
  actions: TaskActions;
}) {
  const done = task.status === "done";
  const pending = actions.pending.has(task.id);

  return (
    <tr
      className={cn(
        "group border-t border-border transition-colors sm:hover:bg-surface-2/50",
        "max-sm:grid max-sm:grid-cols-[1.5rem_minmax(0,1fr)] max-sm:gap-x-1.5 max-sm:px-2 max-sm:py-1.5",
        done && "opacity-70",
        pending && "pointer-events-none opacity-60"
      )}
    >
      <td
        className={cn(
          CELL,
          "px-2 py-1.5 text-center text-xs tabular-nums text-muted max-sm:p-0 max-sm:pt-1 max-sm:text-left"
        )}
      >
        <span className="inline-block leading-5">{number}</span>
      </td>

      <td className={cn(CELL, "p-0")}>
        <div className="flex items-start gap-0.5 pl-1">
          <button
            type="button"
            onClick={() => actions.toggleDone(task)}
            aria-label={done ? "Mark incomplete" : "Mark complete"}
            className="mt-1 shrink-0 rounded-chip p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <span className={cn(checkboxClasses({ done }), "h-4 w-4 rounded-[4px] border")}>
              {done && <Check className="h-2.5 w-2.5 animate-pop" strokeWidth={3} />}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <EditableText
              value={task.title}
              ariaLabel="Item title"
              className={cn("font-medium", done && "text-muted line-through")}
              onSave={(next) => {
                const patch = titlePatch(task, next);
                return patch ? actions.save(patch) : Promise.resolve(true);
              }}
            />
          </div>
          <RowMenu task={task} actions={actions} />
        </div>
      </td>

      <td className={cn(CELL, "px-2 py-1 max-sm:col-start-2 max-sm:px-0 max-sm:py-0.5")}>
        <StatusMenu task={task} onChange={(status) => actions.setStatus(task, status)} />
      </td>

      <td className={cn(CELL, "p-0 max-sm:col-start-2")}>
        <EditableText
          multiline
          value={task.description ?? ""}
          ariaLabel="Comments"
          placeholder="Add comment"
          className={cn("text-xs sm:text-sm", done && "text-muted")}
          onSave={(next) => actions.save(commentPatch(task, next))}
        />
      </td>
    </tr>
  );
}
