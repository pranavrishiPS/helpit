"use client";

import { useState } from "react";
import { Plus, Check, Trash2 } from "lucide-react";
import type { Task, TaskPriority } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
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
    return (
      <p className="py-4 text-center text-sm text-muted">No tasks here.</p>
    );
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
        "group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-slate-50/80",
        task.status === "done" && "opacity-60",
        overdue && "border-warning/30 bg-warning/10",
        reminderDue && "border-accent/30 bg-accent/5"
      )}
    >
      <button
        onClick={() =>
          onUpdate({
            ...task,
            status: task.status === "done" ? "todo" : "done",
          })
        }
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          task.status === "done"
            ? "border-accent bg-accent text-white"
            : "border-border hover:border-accent"
        )}
      >
        {task.status === "done" && <Check className="h-3 w-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              task.status === "done" && "line-through"
            )}
          >
            {task.title}
          </span>
          <Badge className={priorityColor(task.priority)}>{task.priority}</Badge>
        </div>
        {!compact && task.description && (
          <p className="mt-1 text-xs text-muted">{task.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          {reminderLabel && (
            <span className={cn("inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-accent", reminderDue && "font-medium")}>
              {reminderLabel}
            </span>
          )}
          {task.dueDate && !task.reminderAt && (
            <span className={overdue ? "font-medium text-warning" : ""}>
              Due {formatDueDate(task.dueDate)}
            </span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        className="shrink-0 rounded p-1 text-muted opacity-100 transition-opacity hover:bg-warning/10 hover:text-warning sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export function AddTaskForm({ onAdd }: { onAdd: (task: Partial<Task>) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), priority, dueDate: dueDate || undefined });
    setTitle("");
    setDueDate("");
    setPriority("medium");
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add task
      </Button>
    );
  }

  return (
    <Card className="mt-4 w-full">
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to get done?"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-3">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit">Add</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
