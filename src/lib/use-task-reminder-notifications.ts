"use client";

import { useEffect } from "react";
import type { Task } from "@/lib/types";
import { isReminderDue } from "@/lib/reminder-utils";

const NOTIFIED_KEY = "helpit-reminded-tasks";

function getNotifiedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markNotified(id: string) {
  const ids = getNotifiedIds();
  ids.add(id);
  sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
}

export function useTaskReminderNotifications(tasks: Task[]) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const check = () => {
      const due = tasks.filter(
        (t) =>
          t.status !== "done" &&
          t.reminderAt &&
          isReminderDue(t.reminderAt) &&
          !getNotifiedIds().has(t.id)
      );

      for (const task of due) {
        if (Notification.permission === "granted") {
          new Notification("Helpit reminder", {
            body: task.title,
            icon: "/icon",
            tag: task.id,
          });
          markNotified(task.id);
        }
      }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [tasks]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      const hasReminders = tasks.some((t) => t.reminderAt && t.status !== "done");
      if (hasReminders) {
        Notification.requestPermission().catch(() => undefined);
      }
    }
  }, [tasks]);
}
