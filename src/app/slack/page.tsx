"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { SlackItem } from "@/lib/types";
import { PageHeader, Card, Badge, Button, ErrorBanner } from "@/components/ui";
import { formatDueDate, priorityColor } from "@/lib/utils";
import { Check, MessageSquare, RefreshCw, ExternalLink, Timer } from "lucide-react";
import { useDashboard } from "@/lib/use-dashboard";
import { fetchSlackStatus, syncSlack, updateSlackItem } from "@/lib/api-client";
import { handleSlackSyncResponse, formatSlackSyncCountdown } from "@/lib/slack-events";
import { notifyStoreUpdated } from "@/lib/store-events";

interface SlackStatus {
  configured: boolean;
  connected: boolean;
  autoSyncAvailable?: boolean;
  autoSyncDisabledReason?: string;
  teamName?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

export default function SlackPage() {
  const { store, loading, error, clearError, reload } = useDashboard();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncCountdown, setSyncCountdown] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await fetchSlackStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connected || status.autoSyncAvailable === false) {
      setSyncCountdown("");
      return;
    }

    function tick() {
      setSyncCountdown(formatSlackSyncCountdown(status?.lastSyncedAt));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status?.connected, status?.autoSyncAvailable, status?.lastSyncedAt]);

  async function markDone(id: string) {
    setActionError(null);
    try {
      await updateSlackItem(id, true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to mark item done");
      return;
    }
    await reload();
    notifyStoreUpdated();
  }

  async function syncNow() {
    setSyncing(true);
    setActionError(null);
    try {
      const res = await syncSlack();
      const result = await handleSlackSyncResponse(res);
      if (!result.ok) {
        setActionError(result.error ?? "Slack sync failed");
        await loadStatus();
        return;
      }
      await reload();
      await loadStatus();
      notifyStoreUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Slack sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading Slack...</div>;
  }

  if (!store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load Slack"}</div>;
  }

  const items: SlackItem[] = store.slackItems;
  const visible = items.filter((i) => showDone || !i.completed);
  const openCount = items.filter((i) => !i.completed).length;

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      <PageHeader
        title="Slack"
        description={
          status?.autoSyncAvailable === false
            ? "Track Slack follow-ups manually — auto-sync is unavailable with current workspace permissions"
            : "Follow-ups pulled from your Slack workspace"
        }
      />

      {status && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="text-sm">
            {status.connected ? (
              <div>
                <span>
                  {status.autoSyncAvailable === false ? "Connected" : "Synced"}
                  {status.teamName ? ` · ${status.teamName}` : ""}
                  {status.autoSyncAvailable !== false && status.lastSyncedAt && (
                    <span className="text-muted">
                      {" "}
                      · Last {new Date(status.lastSyncedAt).toLocaleString()}
                    </span>
                  )}
                </span>
                {status.autoSyncAvailable === false ? (
                  <p className="mt-1 text-muted">
                    {status.autoSyncDisabledReason ??
                      "Auto-sync is off — add items via the assistant or mark them done here."}
                  </p>
                ) : (
                  syncCountdown && (
                    <p className="mt-1 flex items-center gap-1.5 text-muted">
                      <Timer className="h-3.5 w-3.5 shrink-0" />
                      <span>{syncCountdown}</span>
                      {!syncCountdown.startsWith("Resumes") && (
                        <span className="text-xs">· 9 AM–7 PM</span>
                      )}
                    </p>
                  )
                )}
              </div>
            ) : (
              <div>
                <span className="text-muted">
                  {status.configured
                    ? "Not connected — connect in Settings to enable live sync"
                    : "Add Slack credentials to .env.local, then connect in Settings"}
                </span>
                <p className="mt-1 flex items-center gap-1.5 text-muted">
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {status.autoSyncAvailable === false
                      ? "Manual sync from Settings after connecting"
                      : "Auto-sync every 10 min · 9 AM–7 PM (starts after connect)"}
                  </span>
                </p>
              </div>
            )}
            {status.lastSyncError && (
              <p className="mt-1 text-xs text-warning">{status.lastSyncError}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!status.connected && (
              <Link href="/settings">
                <Button variant="secondary" size="sm">
                  Settings
                </Button>
              </Link>
            )}
            {status.connected && status.autoSyncAvailable !== false && (
              <Button variant="secondary" size="sm" onClick={syncNow} disabled={syncing}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sync now
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{openCount} open items</p>
        <Button variant="ghost" size="sm" onClick={() => setShowDone(!showDone)}>
          {showDone ? "Hide done" : "Show done"}
        </Button>
      </div>

      <div className="space-y-3">
        {visible.map((item) => (
          <Card key={item.id} className={item.completed ? "opacity-50" : ""}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <MessageSquare className="h-4 w-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-accent">{item.channel}</span>
                    <Badge className={priorityColor(item.priority)}>{item.priority}</Badge>
                    <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                      {item.action.replace("_", " ")}
                    </Badge>
                    {item.source === "slack" && (
                      <Badge className="border-accent-secondary/30 bg-accent-secondary/10 text-accent-secondary">
                        synced
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{item.summary}</p>
                  {item.dueDate && (
                    <p className="mt-1 text-xs text-muted">Due {formatDueDate(item.dueDate)}</p>
                  )}
                  {item.threadUrl && (
                    <a
                      href={item.threadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Open in Slack
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              {!item.completed && (
                <Button variant="secondary" size="sm" onClick={() => markDone(item.id)}>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Done
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
