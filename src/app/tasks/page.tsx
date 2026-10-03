"use client";

import { useState } from "react";
import { PageHeader, Card, ErrorBanner, PageSkeleton, Tabs } from "@/components/ui";
import { TaskList, AddTaskForm } from "@/components/tasks/TaskList";
import { useDashboard } from "@/lib/use-dashboard";
import { getTasksTabTasks } from "@/lib/utils";

export default function TasksPage() {
  const { store, loading, error, clearError, updateTask, deleteTask, addTask } = useDashboard();
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");

  if (loading) {
    return <PageSkeleton label="Loading tasks..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load tasks"} />;
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
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      <PageHeader
        title="Tasks"
        module="tasks"
        description="Todos, deadlines, and follow-ups across all modules"
        action={<AddTaskForm onAdd={addTask} prominent />}
      />

      <Tabs
        className="mb-4"
        aria-label="Filter tasks"
        value={filter}
        onChange={setFilter}
        items={tabs}
      />

      <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
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
