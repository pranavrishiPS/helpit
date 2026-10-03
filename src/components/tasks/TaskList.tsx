"use client";

import { useState } from "react";
import { Plus, Check, ListTodo, Trash2 } from "lucide-react";
import type { Task, TaskPriority } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  checkboxClasses,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDueDate, isOverdue, priorityColor } from "@/lib/utils";
import { formatReminderAt, isReminderDue } from "@/lib/reminder-utils";

export function TaskList({
  tasks,
  onUpdate,
  onDelete,
  compact,
}: {
  tasks: Task[];
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  if (tasks.length === 0) {
    return <EmptyState compact icon={ListTodo} title="No tasks here." />;
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onUpdate={onUpdate}
          onDelete={onDelete}
          compact={compact}
        />
      ))}
    </ul>
  );
}

function TaskRow({
  task,
  onUpdate,
  onDelete,
  compact,
}: {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const overdue = isOverdue(task.dueDate) && task.status !== "done";
  const reminderDue = isReminderDue(task.reminderAt) && task.status !== "done";
  const reminderLabel = formatReminderAt(task.reminderAt);

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-card",
        task.status === "done" && "opacity-70",
        overdue &&
          "border-danger/25 bg-danger-soft/50 shadow-[inset_3px_0_0_var(--danger)] hover:shadow-[inset_3px_0_0_var(--danger),var(--shadow-card)]",
        reminderDue &&
          "border-accent/25 bg-accent-soft/50 shadow-[inset_3px_0_0_var(--signal)] hover:shadow-[inset_3px_0_0_var(--signal),var(--shadow-card)]"
      )}
    >
      <button
        type="button"
        onClick={() =>
          onUpdate({
            ...task,
            status: task.status === "done" ? "todo" : "done",
          })
        }
        aria-label={task.status === "done" ? "Mark incomplete" : "Mark complete"}
        className={cn("mt-0.5", checkboxClasses({ done: task.status === "done" }))}
      >
        {task.status === "done" && <Check className="h-3 w-3 animate-pop" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "break-words text-sm font-medium",
              task.status === "done" && "text-muted line-through"
            )}
          >
            {task.title}
          </span>
          <Badge className={cn("capitalize", priorityColor(task.priority))}>{task.priority}</Badge>
        </div>
        {!compact && task.description && (
          <p className="mt-1 text-xs text-muted">{task.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {reminderLabel && (
            <span className={cn("inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent", reminderDue && "font-semibold")}>
              {reminderLabel}
            </span>
          )}
          {task.dueDate && !task.reminderAt && (
            <span className={overdue ? "font-semibold text-danger" : ""}>
              Due {formatDueDate(task.dueDate)}
            </span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-chip bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label="Delete task"
        className="-my-1 grid h-8 w-8 shrink-0 place-items-center rounded-control text-muted opacity-100 transition-[opacity,background-color,color] hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

/** onAdd resolves to false when the task could not be created (input is then kept). */
export function AddTaskForm({
  onAdd,
  prominent,
}: {
  onAdd: (task: Partial<Task>) => Promise<boolean | void> | void;
  /** Page-header placement: primary button, full width on phones. */
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onAdd({ title: title.trim(), priority, dueDate: dueDate || undefined });
      // Keep the form (and the user's text) open if the create failed.
      if (ok === false) return;
      setTitle("");
      setDueDate("");
      setPriority("medium");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant={prominent ? "primary" : "secondary"}
        size={prominent ? "md" : "sm"}
        onClick={() => setOpen(true)}
        className={prominent ? "w-full sm:w-auto" : undefined}
      >
        <Plus />
        Add task
      </Button>
    );
  }

  return (
    <Card className="w-full border-accent/25 shadow-raised sm:min-w-[22rem]">
      <form onSubmit={submit} className="space-y-3">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to get done?"
          aria-label="Task title"
        />
        <div className="flex flex-wrap gap-3">
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            aria-label="Priority"
            className="w-auto min-w-0 flex-1"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
            className="w-auto min-w-0 flex-1"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
