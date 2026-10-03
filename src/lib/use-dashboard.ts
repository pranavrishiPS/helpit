"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardStore, Task } from "@/lib/types";
import {
  createTask as apiCreateTask,
  deleteTask as apiDeleteTask,
  fetchStore,
  updateTask as apiUpdateTask,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";
import { useStoreUpdated } from "@/lib/use-store-updated";

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

  useEffect(() => {
    load();
  }, [load]);

  useStoreUpdated(load);

  const clearError = useCallback(() => setError(null), []);

  /** Runs a mutation, then reloads. Returns false (and sets `error`) if it failed. */
  const mutate = useCallback(
    async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
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

  return {
    store,
    loading,
    error,
    clearError,
    reload: load,
    updateTask,
    deleteTask,
    addTask,
  };
}
