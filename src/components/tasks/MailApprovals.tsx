"use client";

import { useState } from "react";
import type { SprintApproval, SprintApprovalParty } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { CheckCircle2, ChevronDown, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  releasePlatformTitleClass,
  compareBuildVersionTitlesDesc,
  formatSprintApprovalTitle,
} from "@/lib/utils";

const PARTY_LABELS: Record<SprintApprovalParty, string> = {
  gm: "GM",
  dev: "Dev",
  qa: "QA",
};

const PARTIES: SprintApprovalParty[] = ["gm", "dev", "qa"];

function inferPlatform(title: string): SprintApproval["platform"] | undefined {
  const lower = title.toLowerCase();
  if (lower.includes("android")) return "android";
  if (lower.includes("ios")) return "ios";
  return undefined;
}

function isComplete(item: SprintApproval): boolean {
  return PARTIES.every((party) => item.approvals[party]);
}

function isMailSent(item: SprintApproval): boolean {
  return !!item.sentAt;
}

function sortApprovals(items: SprintApproval[]): SprintApproval[] {
  return [...items].sort((a, b) => compareBuildVersionTitlesDesc(a.title, b.title));
}

interface ApprovalItemProps {
  item: SprintApproval;
  onToggle: (id: string, party: SprintApprovalParty, approved: boolean) => void;
  onMailSent: (id: string, mailSent: boolean) => void | Promise<void>;
  complete: boolean;
}

function ApprovalMobileCard({
  item,
  onToggle,
  onMailSent,
  complete,
}: ApprovalItemProps) {
  const platform = item.platform ?? inferPlatform(item.title);
  const title = formatSprintApprovalTitle(item.title, platform);
  const mailSent = isMailSent(item);
  const [markingSent, setMarkingSent] = useState(false);

  async function handleMarkSent() {
    setMarkingSent(true);
    try {
      await onMailSent(item.id, true);
    } finally {
      setMarkingSent(false);
    }
  }

  return (
    <Card
      className={cn(
        "p-3",
        complete && "border-emerald-200 bg-emerald-50/50",
        !mailSent && !complete && "bg-slate-50/50"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p
          className={cn(
            "text-sm font-medium leading-tight",
            platform ? releasePlatformTitleClass(platform) : "text-foreground"
          )}
        >
          {title}
        </p>
        {!mailSent ? (
          <button
            type="button"
            onClick={handleMarkSent}
            disabled={markingSent}
            className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
          >
            {markingSent ? "Saving…" : "Mark mail sent"}
          </button>
        ) : (
          <Badge
            className={cn(
              "px-1.5 py-px text-[11px]",
              complete
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-warning/30 bg-warning/10 text-warning"
            )}
          >
            {complete ? "Complete" : "Pending"}
          </Badge>
        )}
      </div>

      {!mailSent ? (
        <p className="mt-3 text-center text-[11px] italic text-muted">Mail not sent yet</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PARTIES.map((party) => {
            const approved = item.approvals[party];
            return (
              <div key={party} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-medium text-muted">{PARTY_LABELS[party]}</span>
                <button
                  type="button"
                  onClick={() => onToggle(item.id, party, !approved)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-slate-100 hover:text-foreground"
                  aria-label={`${PARTY_LABELS[party]} ${approved ? "approved" : "pending"}`}
                >
                  {approved ? (
                    <CheckCircle2 className="h-4 w-4 fill-emerald-500 stroke-emerald-500 text-white" />
                  ) : (
                    <Circle className="h-4 w-4 stroke-current" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ApprovalRow({ item, onToggle, onMailSent, complete }: ApprovalItemProps) {
  const platform = item.platform ?? inferPlatform(item.title);
  const title = formatSprintApprovalTitle(item.title, platform);
  const mailSent = isMailSent(item);
  const [markingSent, setMarkingSent] = useState(false);

  async function handleMarkSent() {
    setMarkingSent(true);
    try {
      await onMailSent(item.id, true);
    } finally {
      setMarkingSent(false);
    }
  }

  return (
    <tr
      className={cn(
        "border-b border-border/60 last:border-b-0",
        complete && "bg-emerald-50",
        !mailSent && !complete && "bg-slate-50/50"
      )}
    >
      <td className="px-3 py-2">
        <p
          className={cn(
            "text-sm font-medium leading-tight",
            platform ? releasePlatformTitleClass(platform) : "text-foreground"
          )}
        >
          {title}
        </p>
      </td>
      {mailSent ? (
        PARTIES.map((party) => {
          const approved = item.approvals[party];
          return (
            <td key={party} className="px-1 py-1.5 text-center">
              <button
                type="button"
                onClick={() => onToggle(item.id, party, !approved)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-slate-100 hover:text-foreground"
                aria-label={`${PARTY_LABELS[party]} ${approved ? "approved" : "pending"}`}
                title={approved ? `Undo ${PARTY_LABELS[party]} approval` : `Mark ${PARTY_LABELS[party]} approved`}
              >
                {approved ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 fill-emerald-500 stroke-emerald-500 text-white" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 stroke-current" />
                )}
              </button>
            </td>
          );
        })
      ) : (
        <td colSpan={3} className="px-3 py-2 text-center">
          <span className="text-[11px] italic text-muted">Mail not sent yet</span>
        </td>
      )}
      <td className="w-28 px-3 py-2 text-center">
        {!mailSent ? (
          <button
            type="button"
            onClick={handleMarkSent}
            disabled={markingSent}
            className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
          >
            {markingSent ? "Saving…" : "Mark mail sent"}
          </button>
        ) : (
          <Badge
            className={cn(
              "min-w-[4.75rem] justify-center px-1.5 py-px text-[11px]",
              complete
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-warning/30 bg-warning/10 text-warning"
            )}
          >
            {complete ? "Complete" : "Pending"}
          </Badge>
        )}
      </td>
    </tr>
  );
}

function ApprovalTable({
  items,
  onToggle,
  onMailSent,
}: {
  items: SprintApproval[];
  onToggle: (id: string, party: SprintApprovalParty, approved: boolean) => void;
  onMailSent: (id: string, mailSent: boolean) => void | Promise<void>;
}) {
  if (items.length === 0) return null;

  return (
    <>
      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <ApprovalMobileCard
            key={item.id}
            item={item}
            onToggle={onToggle}
            onMailSent={onMailSent}
            complete={isComplete(item)}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-border bg-slate-50/80 text-left text-[11px] text-muted">
              <th className="px-3 py-2 font-medium">Builds</th>
              {PARTIES.map((party) => (
                <th key={party} className="w-14 px-1 py-2 text-center font-medium">
                  {PARTY_LABELS[party]}
                </th>
              ))}
              <th className="w-28 px-3 py-2 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ApprovalRow
                key={item.id}
                item={item}
                onToggle={onToggle}
                onMailSent={onMailSent}
                complete={isComplete(item)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface MailApprovalsProps {
  items: SprintApproval[];
  onToggle: (id: string, party: SprintApprovalParty, approved: boolean) => void;
  onMailSent: (id: string, mailSent: boolean) => void | Promise<void>;
}

export function MailApprovals({ items, onToggle, onMailSent }: MailApprovalsProps) {
  const [completedOpen, setCompletedOpen] = useState(false);

  const pending = sortApprovals(items.filter((item) => !isComplete(item)));
  const completed = sortApprovals(items.filter((item) => isComplete(item)));

  if (items.length === 0) {
    return (
      <Card className="py-8 text-center">
        <p className="text-sm text-muted">
          No sprint costing approvals yet. Add a release in Planning to track GM, Dev, and QA
          sign-off here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {pending.length > 0 ? (
        <ApprovalTable items={pending} onToggle={onToggle} onMailSent={onMailSent} />
      ) : (
        <Card className="py-5 text-center">
          <p className="text-sm text-muted">No pending approvals — you&apos;re all caught up.</p>
        </Card>
      )}

      {completed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setCompletedOpen((open) => !open)}
            className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-slate-50/60 px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:bg-slate-100"
            aria-expanded={completedOpen}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                completedOpen && "rotate-180"
              )}
            />
            <span>Completed ({completed.length})</span>
            {!completedOpen && (
              <span className="font-normal text-muted/70">— uncheck to restore</span>
            )}
          </button>
          {completedOpen && (
            <div className="mt-2">
              <ApprovalTable items={completed} onToggle={onToggle} onMailSent={onMailSent} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
