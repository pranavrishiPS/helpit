"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PageHeader, ErrorBanner, PageSkeleton, SectionTitle } from "@/components/ui";
import { MailTodos } from "@/components/tasks/MailTodos";
import { MailInbox } from "@/components/tasks/MailInbox";
import { MailApprovals } from "@/components/tasks/MailApprovals";
import { useDashboard } from "@/lib/use-dashboard";
import {
  fetchGmailStatus,
  syncGmail,
  updateMailItem,
  updateSprintApproval,
  updateSprintApprovalMailSent,
} from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";
import type { MailItem, SprintApprovalParty } from "@/lib/types";
import { getMailTabTasks } from "@/lib/utils";

export default function MailPage() {
  const { store, loading, error, clearError, updateTask, deleteTask, addTask, reload } = useDashboard();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const autoSynced = useRef(false);

  const loadGmailStatus = useCallback(async () => {
    try {
      const status = await fetchGmailStatus();
      setGmailConnected(!!status.connected);
      setLastSyncedAt(status.lastSyncedAt);
      return !!status.connected;
    } catch {
      setGmailConnected(false);
      return false;
    }
  }, []);

  const handleGmailSync = useCallback(async () => {
    setSyncing(true);
    setActionError(null);
    try {
      const result = await syncGmail();
      if (!result.ok) {
        setActionError(result.error ?? "Gmail sync failed");
        return;
      }
      await reload();
      await loadGmailStatus();
      notifyStoreUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gmail sync failed");
    } finally {
      setSyncing(false);
    }
  }, [reload, loadGmailStatus]);

  // Sync Gmail once each time the page is opened (when connected).
  useEffect(() => {
    if (autoSynced.current) return;
    autoSynced.current = true;
    loadGmailStatus().then((connected) => {
      if (connected) void handleGmailSync();
    });
  }, [loadGmailStatus, handleGmailSync]);

  function handleAddTask(partial: Parameters<typeof addTask>[0]) {
    return addTask({ ...partial, source: "mail" });
  }

  async function handleMailStatus(id: string, status: MailItem["status"]) {
    setActionError(null);
    try {
      await updateMailItem(id, status);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update mail item");
      return;
    }
    await reload();
    notifyStoreUpdated();
  }

  async function handleApprovalToggle(
    id: string,
    party: SprintApprovalParty,
    approved: boolean
  ) {
    setActionError(null);
    try {
      await updateSprintApproval(id, party, approved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update approval");
      return;
    }
    await reload();
    notifyStoreUpdated();
  }

  async function handleMailSent(id: string, mailSent: boolean) {
    setActionError(null);
    try {
      await updateSprintApprovalMailSent(id, mailSent);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update approval");
      return;
    }
    await reload();
    notifyStoreUpdated();
  }

  if (loading) {
    return <PageSkeleton label="Loading..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load mail"} />;
  }

  const tasks = getMailTabTasks(store.tasks);
  const approvals = store.sprintApprovals ?? [];

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      <PageHeader
        title="Mail"
        module="mail"
        description="Gmail inbox, sprint costing approvals, and personal reminders"
      />

      <section className="mb-8">
        <SectionTitle>Inbox</SectionTitle>
        <MailInbox
          items={store.mailItems}
          onUpdateStatus={handleMailStatus}
          onSync={handleGmailSync}
          syncing={syncing}
          connected={gmailConnected}
          lastSyncedAt={lastSyncedAt}
        />
      </section>

      <section className="mb-8">
        <SectionTitle>Sprint approvals</SectionTitle>
        <MailApprovals
          items={approvals}
          onToggle={handleApprovalToggle}
          onMailSent={handleMailSent}
        />
      </section>

      <section className="mb-8">
        <SectionTitle>Reminders</SectionTitle>
        <MailTodos
          tasks={tasks}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAdd={handleAddTask}
        />
      </section>
    </div>
  );
}
