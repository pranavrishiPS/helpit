"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardStore, Task } from "@/lib/types";
import {
  createTask as apiCreateTask,
  deleteTask as apiDeleteTask,
  fetchStore,
  updateTask as apiUpdateTask,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";
import { useStoreUpdated } from "@/lib/use-store-updated";

export function useDashboard() {
  const [store, setStore] = useState<DashboardStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchStore();
      setStore(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useStoreUpdated(load);

  const updateTask = useCallback(
    async (task: Task) => {
      const { id, createdAt, updatedAt, ...updates } = task;
      void createdAt;
      void updatedAt;
      await apiUpdateTask(id, updates);
      await load();
      notifyStoreUpdated();
    },
    [load]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await apiDeleteTask(id);
      await load();
      notifyStoreUpdated();
    },
    [load]
  );

  const addTask = useCallback(
    async (partial: Partial<Task>) => {
      await apiCreateTask(partial);
      await load();
      notifyStoreUpdated();
    },
    [load]
  );

  return {
    store,
    loading,
    error,
    reload: load,
    updateTask,
    deleteTask,
    addTask,
  };
}
