"use client";

import { useEffect } from "react";
import type { Task } from "@/lib/types";
import { isReminderDue } from "@/lib/reminder-utils";

const NOTIFIED_KEY = "helpit-reminded-tasks";

/** A rescheduled reminder (new reminderAt) is a new key, so it can fire again. */
export function reminderKey(task: Pick<Task, "id" | "reminderAt">): string {
  return `${task.id}|${task.reminderAt ?? ""}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Tracks which reminders already fired. Backed by sessionStorage when available, with an
 * in-memory set as fallback so a storage failure can never cause a re-notify every tick.
 */
export function createNotifiedTracker(getStorage: () => StorageLike | null) {
  const memory = new Set<string>();

  function readStored(): string[] {
    try {
      const raw = getStorage()?.getItem(NOTIFIED_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  }

  return {
    has(key: string): boolean {
      return memory.has(key) || readStored().includes(key);
    },
    add(key: string): void {
      memory.add(key);
      try {
        const storage = getStorage();
        if (!storage) return;
        const ids = new Set(readStored());
        ids.add(key);
        storage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
      } catch {
        // Storage unavailable or full: the in-memory set still prevents repeats.
      }
    },
  };
}

const notified = createNotifiedTracker(() => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
});

let permissionAsked = false;

/**
 * Ask for notification permission. Must be called from a user gesture (click): Safari and
 * Firefox ignore requests made without one. Asks at most once per page load.
 */
export function requestReminderPermission(): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default" || permissionAsked) return;
  permissionAsked = true;
  try {
    void Promise.resolve(Notification.requestPermission()).catch(() => undefined);
  } catch {
    // Older browsers throw instead of returning a promise.
  }
}

export function useTaskReminderNotifications(tasks: Task[]) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const check = () => {
      if (Notification.permission !== "granted") return;
      const due = tasks.filter(
        (t) =>
          t.status !== "done" &&
          t.reminderAt &&
          isReminderDue(t.reminderAt) &&
          !notified.has(reminderKey(t))
      );

      for (const task of due) {
        // Mark first so a failure after showing can't re-notify on the next tick.
        notified.add(reminderKey(task));
        new Notification("Helpit reminder", {
          body: task.title,
          icon: "/icon",
          tag: reminderKey(task),
        });
      }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [tasks]);
}
