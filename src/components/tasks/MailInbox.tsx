"use client";

import Link from "next/link";
import type { MailItem } from "@/lib/types";
import { Badge, Button, Card, EmptyState, buttonClasses, type BadgeTone } from "@/components/ui";
import { Mail, RefreshCw } from "lucide-react";
import { formatDueDate } from "@/lib/utils";

const STATUS_LABELS: Record<MailItem["status"], string> = {
  unread: "Unread",
  needs_reply: "Needs reply",
  drafted: "Drafted",
  done: "Done",
};

const STATUS_TONES: Record<MailItem["status"], BadgeTone> = {
  unread: "accent",
  needs_reply: "caution",
  drafted: "info",
  done: "success",
};

interface MailInboxProps {
  items: MailItem[];
  onUpdateStatus: (id: string, status: MailItem["status"]) => void;
  onSync?: () => void;
  syncing?: boolean;
  connected?: boolean;
  lastSyncedAt?: string;
}

export function MailInbox({
  items,
  onUpdateStatus,
  onSync,
  syncing,
  connected,
  lastSyncedAt,
}: MailInboxProps) {
  const open = items.filter((m) => m.status !== "done");
  const showPlaceholder = items.length === 0;

  return (
    <div>
      {!showPlaceholder && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {open.length} item{open.length === 1 ? "" : "s"} need attention
            {lastSyncedAt && (
              <span className="ml-2">
                · Last sync {new Date(lastSyncedAt).toLocaleString()}
              </span>
            )}
          </p>
          {connected && onSync && (
            <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}>
              <RefreshCw className={syncing ? "animate-spin" : ""} />
              Sync Gmail
            </Button>
          )}
        </div>
      )}

      {showPlaceholder ? (
        <Card>
          <EmptyState
            icon={Mail}
            title="Inbox summary will appear here"
            description={
              connected
                ? "Sync Gmail to pull recent messages and surface what needs a reply or follow-up."
                : "Connect Gmail in Settings to see a summary of messages that need your attention."
            }
            action={
              connected && onSync ? (
                <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}>
                  <RefreshCw className={syncing ? "animate-spin" : ""} />
                  Sync Gmail
                </Button>
              ) : (
                <Link href="/settings" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Connect Gmail
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} tone={item.status === "done" ? "muted" : "default"}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                    <Badge tone="neutral">{item.category}</Badge>
                    {item.source === "gmail" && <Badge tone="info">gmail</Badge>}
                  </div>
                  <p className="mt-2 break-words text-sm font-semibold">{item.subject}</p>
                  <p className="mt-1 text-xs text-muted">From {item.from}</p>
                  <p className="mt-2 text-sm text-muted">{item.summary}</p>
                  {item.followUpDate && (
                    <p className="mt-1 text-xs text-muted">
                      Follow up {formatDueDate(item.followUpDate)}
                    </p>
                  )}
                </div>
                {item.status !== "done" && (
                  <div className="flex shrink-0 flex-row gap-1.5 max-sm:[&>*]:flex-1 sm:flex-col">
                    {item.status === "unread" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onUpdateStatus(item.id, "needs_reply")}
                      >
                        Flag
                      </Button>
                    )}
                    {item.status !== "drafted" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onUpdateStatus(item.id, "drafted")}
                      >
                        Drafted
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onUpdateStatus(item.id, "done")}
                    >
                      Done
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
