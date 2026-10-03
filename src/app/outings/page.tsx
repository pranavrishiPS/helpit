"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Outing, OutingAttendee, OutingExpense } from "@/lib/types";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  FieldError,
  PageSkeleton,
  SectionTitle,
} from "@/components/ui";
import {
  formatCurrency,
  getOutingSpent,
  getOutingRemaining,
  isOutingPast,
  getOutingPoolBreakdown,
  getOutingMemberSuggestions,
} from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  Calendar,
  MapPin,
  Wallet,
  Users,
  ChevronDown,
  ChevronUp,
  Receipt,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useDashboard } from "@/lib/use-dashboard";
import { parseISO } from "date-fns";
import {
  NewOutingDialog,
  EditOutingDialog,
} from "@/components/outings/NewOutingDialog";
import { ExpenseDialog } from "@/components/outings/ExpenseDialog";
import { deleteOutingExpense } from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";

function sortOutings(outings: Outing[]): {
  upcoming: Outing[];
  past: Outing[];
} {
  const upcoming: Outing[] = [];
  const past: Outing[] = [];

  for (const outing of outings) {
    if (isOutingPast(outing)) past.push(outing);
    else upcoming.push(outing);
  }

  upcoming.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1;
    if (!b.date) return 1;
    return parseISO(a.date).getTime() - parseISO(b.date).getTime();
  });

  past.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return parseISO(b.date).getTime() - parseISO(a.date).getTime();
  });

  return { upcoming, past };
}

function formatOutingDate(date?: string): string {
  if (!date) return "Date TBD";
  const d = parseISO(date); // local parse; new Date("YYYY-MM-DD") is UTC midnight
  const dayMonth = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const year = d.toLocaleDateString("en-IN", { year: "2-digit" });
  return `${dayMonth}, ${year}`;
}

function BudgetStrip({ outing, past }: { outing: Outing; past: boolean }) {
  const totalSpent = getOutingSpent(outing);
  const remaining = getOutingRemaining(outing);
  const over = remaining < 0;
  const usedPct = outing.budget > 0 ? (totalSpent / outing.budget) * 100 : 0;
  const pool = getOutingPoolBreakdown(outing);
  const goingLabel = past ? "attended" : "going";

  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <Wallet className="h-4 w-4 text-muted" aria-hidden="true" />
          Team pool
        </span>
        <span>
          <span className="text-muted">Spent </span>
          <span className="font-semibold tabular-nums">{formatCurrency(totalSpent)}</span>
        </span>
        <span className={over ? "text-danger" : "text-success"}>
          <span>{over ? "Over budget " : "Remaining "}</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(over ? -remaining : remaining)}
          </span>
        </span>
        {past && remaining > 0 && (
          <span className="text-xs text-muted">Usable later this quarter</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Team pool used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(Math.round(usedPct), 100)}
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={cn(
              "h-full rounded-full",
              over ? "bg-danger" : "bg-signal"
            )}
            style={{ width: `${Math.min(usedPct, 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {usedPct.toFixed(0)}% used
          {pool.going > 0 && ` · ${pool.going} ${goingLabel}`}
        </span>
      </div>
    </div>
  );
}

function ExpenseList({
  outing,
  expenses,
  onChanged,
}: {
  outing: Outing;
  expenses: OutingExpense[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OutingExpense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(expense: OutingExpense) {
    if (!window.confirm(`Delete “${expense.title}”?`)) return;
    setDeletingId(expense.id);
    setError(null);
    try {
      await deleteOutingExpense(outing.id, expense.id);
      onChanged();
      notifyStoreUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setDeletingId(null);
    }
  }

  const sorted = [...expenses].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return parseISO(b.date).getTime() - parseISO(a.date).getTime();
  });

  return (
    <div className="space-y-3">
      {error && <FieldError className="mt-0">{error}</FieldError>}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <p className="text-xs text-muted">
          No expenses logged yet. Add outing spend or other spend (snacks etc.)
          here.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((exp) => (
            <li
              key={exp.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{exp.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone={exp.type === "follow_up" ? "pop" : "info"}>
                    {exp.type === "follow_up" ? "Other" : "Outing"}
                  </Badge>
                  {exp.date && <span>{formatOutingDate(exp.date)}</span>}
                  {exp.type === "follow_up" && exp.attendeeCount != null && (
                    <span>{exp.attendeeCount} people</span>
                  )}
                  {exp.notes && <span>{exp.notes}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="mr-1.5 font-semibold tabular-nums">
                  {formatCurrency(exp.amount)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(exp)}
                  className="hover:text-accent"
                  aria-label={`Edit ${exp.title}`}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(exp)}
                  disabled={deletingId === exp.id}
                  className="hover:bg-danger-soft hover:text-danger"
                  aria-label={`Delete ${exp.title}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ExpenseDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          onChanged();
          notifyStoreUpdated();
        }}
        outing={outing}
      />
      {editing && (
        <ExpenseDialog
          open
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
            notifyStoreUpdated();
          }}
          outing={outing}
          expense={editing}
        />
      )}
    </div>
  );
}

const CHIP_TONES = {
  attended: "success",
  absent: "neutral",
  confirmed: "success",
  pending: "caution",
} as const;

function MemberChips({
  attendees,
  past,
}: {
  attendees: OutingAttendee[];
  past: boolean;
}) {
  if (attendees.length === 0) {
    return <p className="text-xs text-muted">None</p>;
  }

  const sorted = [...attendees].sort((a, b) => {
    if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((attendee) => {
        const variant = attendee.confirmed
          ? past
            ? "attended"
            : "confirmed"
          : past
            ? "absent"
            : "pending";

        return (
          <Badge
            key={attendee.name}
            tone={CHIP_TONES[variant]}
            dot={variant === "attended" || variant === "confirmed"}
            className={cn(
              "px-2.5 text-xs",
              variant === "absent" && "line-through decoration-muted/50",
            )}
          >
            {attendee.name}
          </Badge>
        );
      })}
    </div>
  );
}

function CollapsibleSection({
  open,
  onToggle,
  title,
  children,
  icon,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border",
        className,
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between px-3 text-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal",
          open && "border-b border-border bg-surface-2/60",
        )}
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          {icon}
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
        )}
      </button>
      {open && <div className="px-3 py-3">{children}</div>}
    </div>
  );
}

function OutingCard({
  outing,
  past,
  onChanged,
  memberSuggestions,
}: {
  outing: Outing;
  past: boolean;
  onChanged: () => void;
  memberSuggestions: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);

  const attended = outing.attendees.filter((a) => a.confirmed);
  const expenses = outing.expenses ?? [];
  const pool = getOutingPoolBreakdown(outing);

  const yesLabel = past ? "Attended" : "Going";
  const noLabel = past ? "Didn't go" : "Not confirmed";

  return (
    <Card
      tone={past ? "muted" : "default"}
      className={cn(!past && "shadow-[inset_0_3px_0_var(--signal),var(--shadow-card)]")}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="min-w-0 flex-1 rounded-control text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          aria-expanded={expanded}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words font-display text-lg font-semibold leading-6">{outing.title}</h2>
            {pool.teamSize > 0 && (
              <Badge tone="neutral">
                <Users className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">Team members: </span>
                {pool.teamSize}
              </Badge>
            )}
            <Badge tone="neutral" className="tabular-nums">
              <Wallet className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Team pool: </span>
              {formatCurrency(outing.budget)}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {formatOutingDate(outing.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {outing.destination ?? "Venue TBD"}
            </span>
          </div>
        </button>

        <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            className="hover:text-accent"
            aria-label={`Edit ${outing.title}`}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded((open) => !open)}
            aria-label={expanded ? "Collapse outing" : "Expand outing"}
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="mt-4">
            <BudgetStrip outing={outing} past={past} />
          </div>

          <CollapsibleSection
            className="mt-4"
            open={expensesOpen}
            onToggle={() => setExpensesOpen(!expensesOpen)}
            icon={<Receipt className="h-4 w-4 text-muted" />}
            title={`Expenses (${expenses.length})`}
          >
            <ExpenseList
              outing={outing}
              expenses={expenses}
              onChanged={onChanged}
            />
          </CollapsibleSection>

          <CollapsibleSection
            className="mt-4"
            open={membersOpen}
            onToggle={() => setMembersOpen(!membersOpen)}
            title={
              <>
                {yesLabel} ({attended.length})
                {pool.notGoing > 0 && ` · ${noLabel} (${pool.notGoing})`}
              </>
            }
          >
            <MemberChips attendees={outing.attendees} past={past} />
          </CollapsibleSection>
        </>
      )}

      <EditOutingDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => {
          onChanged();
          notifyStoreUpdated();
        }}
        outing={outing}
        memberSuggestions={memberSuggestions}
      />
    </Card>
  );
}

export default function OutingsPage() {
  const { store, loading, error, clearError, reload } = useDashboard();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { upcoming, past } = useMemo(
    () => sortOutings(store?.outings ?? []),
    [store?.outings],
  );
  const memberSuggestions = useMemo(
    () => getOutingMemberSuggestions(store?.outings ?? []),
    [store?.outings],
  );

  if (loading) {
    return <PageSkeleton label="Loading outings..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load outings"} />;
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      <PageHeader
        title="Team Outings"
        module="outings"
        description="Track budget, attendance, and other spend"
        action={
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
            <Plus />
            New outing
          </Button>
        }
      />

      <NewOutingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={async () => {
          await reload();
          notifyStoreUpdated();
        }}
        memberSuggestions={memberSuggestions}
      />

      {upcoming.length > 0 && (
        <section className="mb-8">
          <SectionTitle count={upcoming.length}>Upcoming</SectionTitle>
          <div className="space-y-4">
            {upcoming.map((outing) => (
              <OutingCard
                key={outing.id}
                outing={outing}
                past={false}
                onChanged={reload}
                memberSuggestions={memberSuggestions}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionTitle count={past.length}>Past outings</SectionTitle>
          <div className="space-y-4">
            {past.map((outing) => (
              <OutingCard
                key={outing.id}
                outing={outing}
                past={true}
                onChanged={reload}
                memberSuggestions={memberSuggestions}
              />
            ))}
          </div>
        </section>
      )}

      {store.outings.length === 0 && (
        <Card>
          <EmptyState icon={Users} title="No outings yet. Create one to get started." />
        </Card>
      )}
    </div>
  );
}
