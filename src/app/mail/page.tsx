"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";
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
  const { store, loading, error, updateTask, deleteTask, addTask, reload } = useDashboard();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [syncing, setSyncing] = useState(false);

  const loadGmailStatus = useCallback(async () => {
    try {
      const status = await fetchGmailStatus();
      setGmailConnected(!!status.connected);
      setLastSyncedAt(status.lastSyncedAt);
    } catch {
      setGmailConnected(false);
    }
  }, []);

  useEffect(() => {
    loadGmailStatus();
  }, [loadGmailStatus]);

  async function handleAddTask(partial: Parameters<typeof addTask>[0]) {
    await addTask({ ...partial, source: "mail" });
  }

  async function handleMailStatus(id: string, status: MailItem["status"]) {
    await updateMailItem(id, status);
    await reload();
    notifyStoreUpdated();
  }

  async function handleGmailSync() {
    setSyncing(true);
    try {
      await syncGmail();
      await reload();
      await loadGmailStatus();
      notifyStoreUpdated();
    } finally {
      setSyncing(false);
    }
  }

  async function handleApprovalToggle(
    id: string,
    party: SprintApprovalParty,
    approved: boolean
  ) {
    await updateSprintApproval(id, party, approved);
    await reload();
    notifyStoreUpdated();
  }

  async function handleMailSent(id: string, mailSent: boolean) {
    await updateSprintApprovalMailSent(id, mailSent);
    await reload();
    notifyStoreUpdated();
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading...</div>;
  }

  if (error || !store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load mail"}</div>;
  }

  const tasks = getMailTabTasks(store.tasks);
  const approvals = store.sprintApprovals ?? [];

  return (
    <div>
      <PageHeader
        title="Mail"
        description="Gmail inbox, sprint costing approvals, and personal reminders"
      />

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-medium text-muted">Inbox</h2>
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
        <h2 className="mb-2 text-sm font-medium text-muted">Sprint approvals</h2>
        <MailApprovals
          items={approvals}
          onToggle={handleApprovalToggle}
          onMailSent={handleMailSent}
        />
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium text-muted">Reminders</h2>
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
