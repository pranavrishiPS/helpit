"use client";

import { useState } from "react";
import { PageHeader, Card } from "@/components/ui";
import { TaskList, AddTaskForm } from "@/components/tasks/TaskList";
import { useDashboard } from "@/lib/use-dashboard";
import { getTasksTabTasks } from "@/lib/utils";

export default function TasksPage() {
  const { store, loading, error, updateTask, deleteTask, addTask } = useDashboard();
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");

  if (loading) {
    return <div className="text-sm text-muted">Loading tasks...</div>;
  }

  if (error || !store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load tasks"}</div>;
  }

  const tasks = getTasksTabTasks(store.tasks);
  const filtered = tasks.filter((t) => {
    if (filter === "open") return t.status !== "done";
    if (filter === "done") return t.status === "done";
    return true;
  });

  const tabs = [
    { id: "open" as const, label: "Open", count: tasks.filter((t) => t.status !== "done").length },
    { id: "done" as const, label: "Done", count: tasks.filter((t) => t.status === "done").length },
    { id: "all" as const, label: "All", count: tasks.length },
  ];

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Todos, deadlines, and follow-ups across all modules"
        action={<AddTaskForm onAdd={addTask} />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              filter === tab.id ? "bg-brand text-white" : "text-muted hover:bg-slate-100"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <Card>
        <TaskList
          tasks={filtered.sort((a, b) => {
            const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          })}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      </Card>
    </div>
  );
}
