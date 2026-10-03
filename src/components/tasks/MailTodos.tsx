"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Circle,
  ListTodo,
  Plus,
  Trash2,
  BellRing,
} from "lucide-react";
import type { Task, TaskPriority } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatDueDate, isOverdue } from "@/lib/utils";
import {
  isReminderDue,
  reminderToDueDate,
} from "@/lib/reminder-utils";
import { ReminderPicker } from "./ReminderPicker";
import { Button, EmptyState, Tabs, checkboxClasses } from "@/components/ui";

const PRIORITIES: { id: TaskPriority; label: string; color: string }[] = [
  { id: "low", label: "Low", color: "bg-surface-2 text-muted" },
  { id: "medium", label: "Med", color: "bg-info-soft text-info" },
  { id: "high", label: "High", color: "bg-pop-soft text-pop-ink" },
  { id: "urgent", label: "Urgent", color: "bg-danger-soft text-danger" },
];

type TaskFilter = "open" | "done" | "all";

export function MailTodos({
  tasks,
  onAdd,
  onUpdate,
  onDelete,
}: {
  tasks: Task[];
  onAdd: (task: Partial<Task>) => Promise<boolean | void> | void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [reminderAt, setReminderAt] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const list = tasks.filter((t) => {
      if (filter === "open") return t.status !== "done";
      if (filter === "done") return t.status === "done";
      return true;
    });

    return list.sort((a, b) => {
      const aDue = a.reminderAt ? new Date(a.reminderAt).getTime() : Infinity;
      const bDue = b.reminderAt ? new Date(b.reminderAt).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });
  }, [tasks, filter]);

  const reminded = filtered.filter(
    (t) => t.reminderAt && t.status !== "done"
  );
  const rest = filtered.filter(
    (t) => !t.reminderAt || t.status === "done"
  );

  const tabs: { id: TaskFilter; label: string; count: number }[] = [
    {
      id: "open",
      label: "Open",
      count: tasks.filter((t) => t.status !== "done").length,
    },
    {
      id: "done",
      label: "Done",
      count: tasks.filter((t) => t.status === "done").length,
    },
    { id: "all", label: "All", count: tasks.length },
  ];

  function resetComposer() {
    setTitle("");
    setPriority("medium");
    setReminderAt(undefined);
    setExpanded(false);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      const ok = await onAdd({
        title: title.trim(),
        priority,
        reminderAt,
        dueDate: reminderAt ? reminderToDueDate(reminderAt) : undefined,
      });
      // Keep the composer (and the user's text) if the create failed.
      if (ok === false) return;
      resetComposer();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Google Keep / Tasks style composer */}
      <form
        onSubmit={submit}
        className={cn(
          "overflow-hidden rounded-card border bg-card transition-[border-color,box-shadow] duration-150",
          expanded
            ? "border-accent/30 shadow-raised"
            : "border-border shadow-card hover:border-border-strong"
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border-strong">
            <Plus className="h-3 w-3 text-subtle" />
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="Add a task..."
            aria-label="Add a task"
            className="min-w-0 flex-1 bg-transparent text-sm leading-[22px] outline-none placeholder:text-subtle"
          />
        </div>

        {(expanded || title) && (
          <div className="space-y-3 px-4 pb-4">
            <div className="flex flex-wrap items-center gap-2 pl-8">
              <ReminderPicker
                value={reminderAt}
                onChange={setReminderAt}
                compact
              />
              <div className="flex flex-wrap gap-1">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriority(p.id)}
                    aria-pressed={priority === p.id}
                    className={cn(
                      "h-7 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      priority === p.id
                        ? p.color + " ring-1 ring-inset ring-current/25"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pl-8">
              <Button variant="ghost" size="sm" onClick={resetComposer}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!title.trim() || submitting}>
                Add task
              </Button>
            </div>
          </div>
        )}
      </form>

      {/* Filter tabs */}
      <Tabs aria-label="Filter reminders" value={filter} onChange={setFilter} items={tabs} />

      {/* Task list */}
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
        {filtered.length === 0 ? (
          <EmptyState
            title={
              filter === "done"
                ? "No completed reminders"
                : filter === "all" && tasks.length === 0
                  ? "No reminders yet"
                  : "No open reminders"
            }
            description={
              filter === "done"
                ? "Reminders you mark done will appear here."
                : filter === "open" && tasks.some((t) => t.status === "done")
                  ? "You're all caught up — nothing open right now."
                  : "Add a reminder above to get notified like Google Keep."
            }
          />
        ) : (
          <div>
            {reminded.length > 0 && filter !== "done" && (
              <TaskSection
                icon={<BellRing className="h-3.5 w-3.5 text-accent" />}
                title="Reminders"
              >
                {reminded.map((task) => (
                  <MailTaskRow
                    key={task.id}
                    task={task}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </TaskSection>
            )}

            {rest.length > 0 && (
              <TaskSection
                icon={<ListTodo className="h-3.5 w-3.5 text-muted" />}
                title={reminded.length > 0 && filter !== "done" ? "Other tasks" : "Tasks"}
                noBorder={reminded.length === 0 || filter === "done"}
              >
                {rest.map((task) => (
                  <MailTaskRow
                    key={task.id}
                    task={task}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </TaskSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskSection({
  title,
  icon,
  children,
  noBorder,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div className={cn(!noBorder && "border-b border-border")}>
      <div className="flex items-center gap-2 bg-surface-2 px-4 py-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {title}
        </span>
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function MailTaskRow({
  task,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = isOverdue(task.dueDate) && task.status !== "done";
  const reminderDue = isReminderDue(task.reminderAt) && task.status !== "done";

  function setReminder(reminderAt: string | undefined) {
    onUpdate({
      ...task,
      reminderAt,
      dueDate: reminderAt ? reminderToDueDate(reminderAt) : task.dueDate,
    });
  }

  return (
    <li
      className={cn(
        "group flex items-start gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2/60",
        task.status === "done" && "opacity-70",
        reminderDue && "bg-accent-soft/50 shadow-[inset_3px_0_0_var(--accent)] hover:bg-accent-soft/70"
      )}
    >
      <button
        onClick={() =>
          onUpdate({
            ...task,
            status: task.status === "done" ? "todo" : "done",
          })
        }
        type="button"
        className={cn("mt-0.5", checkboxClasses({ done: task.status === "done", round: true }))}
        aria-label={task.status === "done" ? "Mark incomplete" : "Mark complete"}
      >
        {task.status === "done" ? (
          <Check className="h-3 w-3 animate-pop" strokeWidth={3} />
        ) : (
          <Circle className="h-3 w-3 text-transparent" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "break-words text-sm text-foreground",
              task.status === "done" && "line-through text-muted"
            )}
          >
            {task.title}
          </span>
          {task.priority !== "medium" && task.status !== "done" && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                PRIORITIES.find((p) => p.id === task.priority)?.color
              )}
            >
              {task.priority}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <ReminderPicker
            value={task.reminderAt}
            onChange={setReminder}
            compact
          />
          {task.dueDate && !task.reminderAt && (
            <span
              className={cn(
                "text-[11px]",
                overdue ? "font-semibold text-danger" : "text-muted"
              )}
            >
              Due {formatDueDate(task.dueDate)}
            </span>
          )}
          {reminderDue && (
            <span className="text-[11px] font-semibold text-accent">
              Reminder due
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="-my-1 grid h-8 w-8 shrink-0 place-items-center rounded-control text-muted opacity-100 transition-[opacity,background-color,color] hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        aria-label="Delete task"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
