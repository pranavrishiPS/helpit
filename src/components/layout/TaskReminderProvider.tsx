"use client";

import { useDashboard } from "@/lib/use-dashboard";
import { useTaskReminderNotifications } from "@/lib/use-task-reminder-notifications";

/** Global task reminder notifications across all pages. */
export function TaskReminderProvider() {
  const { store } = useDashboard();
  useTaskReminderNotifications(store?.tasks ?? []);
  return null;
}
