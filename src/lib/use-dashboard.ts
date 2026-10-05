"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardStore, Task } from "@/lib/types";
import {
  createRecurringTask as apiCreateRecurringTask,
  createTask as apiCreateTask,
  deleteRecurringTask as apiDeleteRecurringTask,
  deleteTask as apiDeleteTask,
  fetchStore,
  generateRecurring as apiGenerateRecurring,
  updateRecurringTask as apiUpdateRecurringTask,
  updateTask as apiUpdateTask,
  type RecurringRuleResult,
} from "@/lib/api-client";
import type { RecurringRuleFields, RecurringRulePatch } from "@/lib/recurrence";
import { todayKey } from "@/lib/task-board";
import { notifyStoreUpdated } from "@/lib/store-events";
import { useStoreUpdated } from "@/lib/use-store-updated";

/** Outcome of a rule mutation; the message is for the panel (not the page-level `error`). */
export type RuleMutationResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Several hook instances can mount at once (the layout's reminder provider plus the page), and
 * focus plus visibility fire together. They share one in-flight generate call.
 */
let generateInFlight: Promise<number> | null = null;
function runGenerate(): Promise<number> {
  if (!generateInFlight) {
    generateInFlight = apiGenerateRecurring(todayKey())
      .then((result) => result.created)
      .finally(() => {
        generateInFlight = null;
      });
  }
  return generateInFlight;
}

const DAY_ROLLOVER_CHECK_MS = 60_000;

/**
 * `error` holds the latest load/mutation failure. Pages should only block on it
 * when `store` is null; otherwise render a non-blocking banner so drafts survive.
 */
export function useDashboard() {
  const [store, setStore] = useState<DashboardStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic counter so an older, slower response can't overwrite newer data.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetchStore();
      if (id !== requestId.current) return;
      setStore(data);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  /**
   * Creates due recurring rows (server-side, idempotent) and reloads only when something was
   * created, so it can't loop. A failure sets `error` and never blocks the page.
   */
  const generateRecurring = useCallback(async () => {
    try {
      const created = await runGenerate();
      if (created > 0) {
        await load();
        notifyStoreUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create recurring tasks");
    }
  }, [load]);

  // First load, then generate once for this mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) await generateRecurring();
    })();
    return () => {
      cancelled = true;
    };
  }, [load, generateRecurring]);

  // Generate again when the tab regains focus or the local day rolls over.
  useEffect(() => {
    let lastDay = todayKey();
    const run = () => {
      lastDay = todayKey();
      void generateRecurring();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    const timer = setInterval(() => {
      if (todayKey() !== lastDay) run();
    }, DAY_ROLLOVER_CHECK_MS);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [generateRecurring]);

  useStoreUpdated(load);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Runs a mutation, then reloads. Returns false if it failed: the message goes to `onError`
   * when given (e.g. a form that keeps its draft), otherwise to the hook's `error`.
   */
  const mutate = useCallback(
    async (
      action: () => Promise<unknown>,
      fallback: string,
      onError?: (message: string) => void
    ): Promise<boolean> => {
      try {
        await action();
      } catch (err) {
        const message = err instanceof Error ? err.message : fallback;
        if (onError) onError(message);
        else setError(message);
        return false;
      }
      await load();
      notifyStoreUpdated();
      return true;
    },
    [load]
  );

  const updateTask = useCallback(
    (task: Task) => {
      const { id, createdAt, updatedAt, ...updates } = task;
      void createdAt;
      void updatedAt;
      return mutate(() => apiUpdateTask(id, updates), "Failed to update task");
    },
    [mutate]
  );

  const deleteTask = useCallback(
    (id: string) => mutate(() => apiDeleteTask(id), "Failed to delete task"),
    [mutate]
  );

  const addTask = useCallback(
    (partial: Partial<Task>) => mutate(() => apiCreateTask(partial), "Failed to add task"),
    [mutate]
  );

  const mutateRule = useCallback(
    async (
      action: () => Promise<RecurringRuleResult | void>,
      fallback: string,
      knownId?: string
    ): Promise<RuleMutationResult> => {
      let id = knownId ?? "";
      let failure = null as string | null;
      const ok = await mutate(
        async () => {
          const result = await action();
          if (result) id = result.rule.id;
        },
        fallback,
        (message) => {
          failure = message;
        }
      );
      return ok ? { ok: true, id } : { ok: false, error: failure ?? fallback };
    },
    [mutate]
  );

  const createRecurringTask = useCallback(
    (fields: RecurringRuleFields) =>
      mutateRule(() => apiCreateRecurringTask(fields, todayKey()), "Failed to save recurring task"),
    [mutateRule]
  );

  const updateRecurringTask = useCallback(
    (id: string, patch: RecurringRulePatch) =>
      mutateRule(
        () => apiUpdateRecurringTask(id, patch, todayKey()),
        "Failed to update recurring task",
        id
      ),
    [mutateRule]
  );

  const deleteRecurringTask = useCallback(
    (id: string) =>
      mutateRule(
        () => apiDeleteRecurringTask(id, todayKey()),
        "Failed to delete recurring task",
        id
      ),
    [mutateRule]
  );

  return {
    store,
    loading,
    error,
    clearError,
    reload: load,
    updateTask,
    deleteTask,
    addTask,
    recurringTasks: store?.recurringTasks ?? [],
    createRecurringTask,
    updateRecurringTask,
    deleteRecurringTask,
    generateRecurring,
  };
}
