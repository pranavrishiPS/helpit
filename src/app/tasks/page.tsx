"use client";

import { PageHeader, ErrorBanner, PageSkeleton } from "@/components/ui";
import { RecurringControl } from "@/components/tasks/RecurringControl";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { useDashboard } from "@/lib/use-dashboard";
import { getTasksTabTasks } from "@/lib/utils";

export default function TasksPage() {
  const {
    store,
    loading,
    error,
    clearError,
    updateTask,
    deleteTask,
    addTask,
    recurringTasks,
    createRecurringTask,
    updateRecurringTask,
    deleteRecurringTask,
  } = useDashboard();

  if (loading) {
    return <PageSkeleton label="Loading tasks..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load tasks"} />;
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      <PageHeader
        title="Tasks"
        module="tasks"
        description="Todos, deadlines, and follow-ups across all modules"
        action={
          <RecurringControl
            rules={recurringTasks}
            onCreate={createRecurringTask}
            onUpdate={updateRecurringTask}
            onDelete={deleteRecurringTask}
          />
        }
      />

      <TaskBoard
        tasks={getTasksTabTasks(store.tasks)}
        recurringRules={recurringTasks}
        onAdd={addTask}
        onUpdate={updateTask}
        onDelete={deleteTask}
      />
    </div>
  );
}
