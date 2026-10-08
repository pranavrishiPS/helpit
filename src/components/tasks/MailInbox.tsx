"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MailItem } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Tabs,
  buttonClasses,
  type BadgeTone,
} from "@/components/ui";
import { Mail, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDueDate } from "@/lib/utils";
import {
  MAIL_CATEGORIES,
  formatMailTime,
  mailThreadKey,
  mailSenderLabel,
  resolveMailCategory,
  type MailCategory,
} from "@/lib/mail-category";

// Only statuses worth calling out get a badge in the compact row.
const ROW_BADGES: Partial<Record<MailItem["status"], { label: string; tone: BadgeTone }>> = {
  needs_reply: { label: "Needs reply", tone: "caution" },
  drafted: { label: "Drafted", tone: "info" },
};

type Filter = "all" | MailCategory;

interface MailInboxProps {
  items: MailItem[];
  onUpdateStatus: (id: string, status: MailItem["status"]) => void | Promise<void>;
  onSync?: () => void;
  syncing?: boolean;
  connected?: boolean;
}

export function MailInbox({
  items,
  onUpdateStatus,
  onSync,
  syncing,
  connected,
}: MailInboxProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Support mail is read in Gmail itself, not here; drop any left over from older syncs.
  const inboxItems = useMemo(
    () => items.filter((m) => resolveMailCategory(m) !== "support"),
    [items]
  );
  const showPlaceholder = inboxItems.length === 0;

  const openThreads = useMemo(
    () => toThreads(inboxItems.filter((m) => m.status !== "done")),
    [inboxItems]
  );
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, support: 0, leave: 0, meeting: 0, sprint: 0, other: 0 };
    for (const t of openThreads) {
      c.all++;
      c[t.category]++;
    }
    return c;
  }, [openThreads]);

  const visible = openThreads.filter((t) => filter === "all" || t.category === filter);

  const groups =
    filter === "all"
      ? MAIL_CATEGORIES.map((c) => ({
          ...c,
          rows: visible.filter((t) => t.category === c.id),
        })).filter((g) => g.rows.length > 0)
      : [{ id: filter, label: "", rows: visible }];

  async function updateThread(thread: MailThread, status: MailItem["status"]) {
    for (const item of thread.items) {
      if (item.status !== "done" && item.status !== status) await onUpdateStatus(item.id, status);
    }
  }

  return (
    <div>
      {!showPlaceholder && (
        <p className="mb-3 text-sm text-muted">
          {counts.all} conversation{counts.all === 1 ? "" : "s"} need attention
        </p>
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
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Tabs<Filter>
              aria-label="Filter mail by category"
              value={filter}
              onChange={setFilter}
              items={[
                { id: "all", label: "All", count: counts.all },
                ...MAIL_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: counts[c.id] })),
              ]}
            />
          </div>

          <Card className="overflow-hidden p-0 sm:p-0">
            <div className="max-h-[22rem] overflow-y-auto">
              {groups.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">{filter === "all" ? "All caught up" : "No mail in this category"}</p>
              ) : (
                groups.map((group) => (
                  <div key={group.id}>
                    {group.label && (
                      <p className="sticky top-0 z-10 border-b border-border bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {group.label}
                      </p>
                    )}
                    <ul className="divide-y divide-border">
                      {group.rows.map((thread) => (
                        <MailRow
                          key={thread.key}
                          thread={thread}
                          expanded={expandedId === thread.key}
                          onToggle={() =>
                            setExpandedId((cur) => (cur === thread.key ? null : thread.key))
                          }
                          onUpdateStatus={(status) => updateThread(thread, status)}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

interface MailThread {
  key: string;
  category: MailCategory;
  /** Newest first. */
  items: MailItem[];
  latest: MailItem;
  status: MailItem["status"];
}

// Most urgent status in the thread wins, so one unread reply keeps the row unread.
const STATUS_RANK: Record<MailItem["status"], number> = {
  unread: 0,
  needs_reply: 1,
  drafted: 2,
  done: 3,
};

/** Collapse mail that shares a subject (ignoring Re:/Fwd:) into one row per conversation. */
function toThreads(items: MailItem[]): MailThread[] {
  const byKey = new Map<string, MailItem[]>();
  for (const item of items) {
    const key = `${resolveMailCategory(item)}:${mailThreadKey(item.subject)}`;
    const list = byKey.get(key);
    if (list) list.push(item);
    else byKey.set(key, [item]);
  }
  return [...byKey.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
      const status = sorted.reduce<MailItem["status"]>(
        (best, m) => (STATUS_RANK[m.status] < STATUS_RANK[best] ? m.status : best),
        "done"
      );
      return {
        key,
        category: resolveMailCategory(sorted[0]),
        items: sorted,
        latest: sorted[0],
        status,
      };
    })
    .sort(
      (a, b) => new Date(b.latest.receivedAt).getTime() - new Date(a.latest.receivedAt).getTime()
    );
}

function senderSummary(items: MailItem[]): string {
  const names = [...new Set(items.map((m) => mailSenderLabel(m.from)))];
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function MailRow({
  thread,
  expanded,
  onToggle,
  onUpdateStatus,
}: {
  thread: MailThread;
  expanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (status: MailItem["status"]) => void;
}) {
  const { latest, items, status } = thread;
  const done = status === "done";
  const badge = ROW_BADGES[status];
  const detailsId = `mail-details-${latest.id}`;
  const followUp = items.find((m) => m.followUpDate)?.followUpDate;

  return (
    <li className={cn(done && "bg-surface-2/60")}>
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-4 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              status === "unread" ? "bg-accent" : "bg-transparent"
            )}
          />
          {status === "unread" && <span className="sr-only">Unread:</span>}
          <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium",
                done ? "text-muted line-through" : "text-foreground"
              )}
            >
              {latest.subject}
            </span>
            <span className="truncate text-xs text-muted sm:max-w-[14rem] sm:shrink-0">
              {senderSummary(items)}
            </span>
          </span>
          {items.length > 1 && (
            <Badge tone="neutral" title={`${items.length} messages`}>
              {items.length}
            </Badge>
          )}
          {badge && (
            <Badge tone={badge.tone} className="max-sm:hidden">
              {badge.label}
            </Badge>
          )}
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {formatMailTime(latest.receivedAt)}
          </span>
        </button>
      </div>

      {expanded && (
        <div id={detailsId} className="space-y-1.5 px-4 pb-3 pl-[2.125rem]">
          {badge && (
            <Badge tone={badge.tone} className="sm:hidden">
              {badge.label}
            </Badge>
          )}
          {latest.summary && <p className="text-sm text-muted">{latest.summary}</p>}
          <p className="break-all text-xs text-muted">
            {items.length > 1 ? `Latest from ${latest.from} · ${items.length} messages` : `From ${latest.from}`}
          </p>
          {followUp && <p className="text-xs text-muted">Follow up {formatDueDate(followUp)}</p>}
          {!done && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {status === "unread" && (
                <Button variant="ghost" size="sm" onClick={() => onUpdateStatus("needs_reply")}>
                  Flag
                </Button>
              )}
              {status !== "drafted" && (
                <Button variant="ghost" size="sm" onClick={() => onUpdateStatus("drafted")}>
                  Drafted
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => onUpdateStatus("done")}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
