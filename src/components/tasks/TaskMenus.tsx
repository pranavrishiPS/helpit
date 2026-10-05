"use client";

import { useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { Task, TaskStatus } from "@/lib/types";
import { badgeClasses, fieldClasses } from "@/components/ui";
import { DateCommitInput } from "@/components/ui/DateCommitInput";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";
import { BOARD_STATUSES, STATUS_LABELS, shiftDayKey, taskDay } from "@/lib/task-board";
import { statusColor } from "@/lib/utils";

/** Status cell: a badge-styled menu trigger (Todo / In progress / Blocked / Done). */
export function StatusMenu({
  task,
  onChange,
}: {
  task: Task;
  onChange: (status: TaskStatus) => void;
}) {
  const items: MenuItem[] = BOARD_STATUSES.map((status) => ({
    id: status,
    label: STATUS_LABELS[status],
    checked: task.status === status,
    onSelect: () => {
      if (status !== task.status) onChange(status);
    },
  }));

  return (
    <Menu
      label="Change status"
      items={items}
      triggerClassName={cn(
        badgeClasses(),
        statusColor(task.status),
        "h-6 gap-1.5 px-2 text-xs font-medium hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {STATUS_LABELS[task.status]}
      <ChevronDown aria-hidden="true" className="h-3 w-3 opacity-60" />
    </Menu>
  );
}

/** Row "..." menu: move to today / tomorrow / a picked date / no date, and Delete. */
export function RowMenu({ task, actions }: { task: Task; actions: TaskActions }) {
  const [picking, setPicking] = useState(false);
  const { today } = actions;
  const day = taskDay(task);
  const tomorrow = shiftDayKey(today, 1);

  const items: MenuItem[] = [
    ...(day !== today
      ? [{ id: "today", label: "Move to today", onSelect: () => actions.reschedule(task, today) }]
      : []),
    ...(day !== tomorrow
      ? [{ id: "tomorrow", label: "Move to tomorrow", onSelect: () => actions.reschedule(task, tomorrow) }]
      : []),
    { id: "pick", label: "Pick date", keepOpen: true, onSelect: () => setPicking(true) },
    ...(day !== undefined
      ? [{ id: "none", label: "No date", onSelect: () => actions.reschedule(task, undefined) }]
      : []),
    { id: "delete", label: "Delete", destructive: true, onSelect: () => actions.remove(task) },
  ];

  return (
    <Menu
      label="Row actions"
      icon={MoreHorizontal}
      items={items}
      // Visible on hover/focus on desktop, always on touch, and while its menu is open.
      triggerClassName="mt-1 h-6 w-6 shrink-0 sm:opacity-0sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 aria-expanded:opacity-100"
      onOpenChange={(open) => {
        if (!open) setPicking(false);
      }}
      footer={(close) =>
        picking ? (
          <div className="p-1.5">
            <DateCommitInput
              value=""
              aria-label="Pick a date"
              className={cn(fieldClasses({ size: "sm" }), "w-full")}
              onCommit={(value) => {
                if (!value) return;
                actions.reschedule(task, value);
                close();
              }}
            />
          </div>
        ) : null
      }
    />
  );
}

/** Mutations shared by the table rows. */
export interface TaskActions {
  /** Real local today. */
  today: string;
  pending: ReadonlySet<string>;
  setStatus: (task: Task, status: TaskStatus) => void;
  toggleDone: (task: Task) => void;
  reschedule: (task: Task, dayKey: string | undefined) => void;
  remove: (task: Task) => void;
  /** Inline edit of Items (title) or Comments (description); resolves false on failure. */
  save: (task: Task) => Promise<boolean>;
}
