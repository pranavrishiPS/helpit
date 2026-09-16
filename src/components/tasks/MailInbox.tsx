"use client";

import Link from "next/link";
import type { MailItem } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
import { Mail, RefreshCw } from "lucide-react";
import { formatDueDate } from "@/lib/utils";

const STATUS_LABELS: Record<MailItem["status"], string> = {
  unread: "Unread",
  needs_reply: "Needs reply",
  drafted: "Drafted",
  done: "Done",
};

const STATUS_COLORS: Record<MailItem["status"], string> = {
  unread: "border-slate-200 bg-slate-50 text-slate-600",
  needs_reply: "border-warning/30 bg-warning/10 text-warning",
  drafted: "border-accent/30 bg-accent/5 text-accent",
  done: "border-success/30 bg-success/10 text-success",
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
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Sync Gmail
            </Button>
          )}
        </div>
      )}

      {showPlaceholder ? (
        <Card className="py-10 text-center">
          <Mail className="mx-auto mb-3 h-9 w-9 text-muted/40" />
          <p className="text-sm font-medium text-foreground">Inbox summary will appear here</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {connected
              ? "Sync Gmail to pull recent messages and surface what needs a reply or follow-up."
              : "Connect Gmail in Settings to see a summary of messages that need your attention."}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {connected && onSync ? (
              <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sync Gmail
              </Button>
            ) : (
              <Link href="/settings">
                <Button variant="secondary" size="sm">Connect Gmail</Button>
              </Link>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={item.status === "done" ? "opacity-60" : ""}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_COLORS[item.status]}>
                      {STATUS_LABELS[item.status]}
                    </Badge>
                    <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                      {item.category}
                    </Badge>
                    {item.source === "gmail" && (
                      <Badge className="border-accent-secondary/30 bg-accent-secondary/10 text-accent-secondary">
                        gmail
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium">{item.subject}</p>
                  <p className="mt-1 text-xs text-muted">From {item.from}</p>
                  <p className="mt-2 text-sm text-muted">{item.summary}</p>
                  {item.followUpDate && (
                    <p className="mt-1 text-xs text-muted">
                      Follow up {formatDueDate(item.followUpDate)}
                    </p>
                  )}
                </div>
                {item.status !== "done" && (
                  <div className="flex shrink-0 flex-row flex-wrap gap-1 sm:flex-col">
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
