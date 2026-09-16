"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Outing, OutingAttendee, OutingExpense } from "@/lib/types";
import { PageHeader, Card, Badge, Button } from "@/components/ui";
import {
  formatCurrency,
  getOutingSpent,
  getOutingExpensesByType,
  getOutingRemaining,
  isOutingPast,
  getOutingConfirmedAttendees,
  getFollowUpAttendeeCount,
  getFollowUpBudgetPerPerson,
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
import { NewOutingDialog, EditOutingDialog } from "@/components/outings/NewOutingDialog";
import { ExpenseDialog } from "@/components/outings/ExpenseDialog";
import { deleteOutingExpense } from "@/lib/api-client";
import { notifyStoreUpdated } from "@/lib/store-events";

function sortOutings(outings: Outing[]): { upcoming: Outing[]; past: Outing[] } {
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
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function BudgetStrip({ outing }: { outing: Outing }) {
  const totalSpent = getOutingSpent(outing);
  const outingSpent = getOutingExpensesByType(outing, "outing");
  const followUpSpent = getOutingExpensesByType(outing, "follow_up");
  const remaining = getOutingRemaining(outing);
  const usedPct = outing.budget > 0 ? (totalSpent / outing.budget) * 100 : 0;
  const outingMembers = getOutingConfirmedAttendees(outing).length;
  const snackMembers = getFollowUpAttendeeCount(outing);
  const snackPerPerson = getFollowUpBudgetPerPerson(outing);

  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="h-4 w-4 text-muted" />
          <span className="font-medium">Budget</span>
          {outing.budgetPerPerson != null && (
            <span className="text-muted">
              · {formatCurrency(outing.budgetPerPerson)}/person
              {outingMembers > 0 && ` · ${outingMembers} outing`}
            </span>
          )}
        </div>
        <div className="text-right text-sm">
          <span className="font-semibold">{formatCurrency(outing.budget)}</span>
          <span className="text-muted"> total</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-white px-3 py-2">
          <p className="text-xs text-muted">Outing spend</p>
          <p className="text-sm font-medium">{formatCurrency(outingSpent)}</p>
          {outingMembers > 0 && (
            <p className="mt-0.5 text-xs text-muted">{outingMembers} members</p>
          )}
        </div>
        <div className="rounded-md border border-border bg-white px-3 py-2">
          <p className="text-xs text-muted">Follow-up (snacks etc.)</p>
          <p className="text-sm font-medium">{formatCurrency(followUpSpent)}</p>
          {snackMembers > 0 ? (
            <p className="mt-0.5 text-xs text-muted">
              {snackMembers} members
              {snackPerPerson != null && ` · ${formatCurrency(snackPerPerson)}/person left`}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">Set after outing</p>
          )}
        </div>
        <div className="rounded-md border border-accent/20 bg-accent/10 px-3 py-2">
          <p className="text-xs text-accent">Remaining pool</p>
          <p className="text-sm font-medium text-accent">
            {formatCurrency(remaining)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-between gap-1 text-xs text-muted">
        <span>{formatCurrency(totalSpent)} spent total</span>
        <span>{usedPct.toFixed(0)}% of budget used</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.min(usedPct, 100)}%` }}
        />
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

  async function handleDelete(expense: OutingExpense) {
    if (!window.confirm(`Delete “${expense.title}”?`)) return;
    setDeletingId(expense.id);
    try {
      await deleteOutingExpense(outing.id, expense.id);
      onChanged();
      notifyStoreUpdated();
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
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <p className="text-xs text-muted">
          No expenses logged yet. Add outing spend or follow-up snack orders here.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((exp) => (
            <li
              key={exp.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{exp.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge
                    className={
                      exp.type === "outing" || (exp.type as string) === "event"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-warning/30 bg-warning/10 text-warning"
                    }
                  >
                    {exp.type === "follow_up" ? "Follow-up" : "Outing"}
                  </Badge>
                  {exp.date && <span>{formatOutingDate(exp.date)}</span>}
                  {exp.type === "follow_up" && exp.attendeeCount != null && (
                    <span>{exp.attendeeCount} people</span>
                  )}
                  {exp.notes && <span>{exp.notes}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-1 font-medium">{formatCurrency(exp.amount)}</span>
                <button
                  type="button"
                  onClick={() => setEditing(exp)}
                  className="rounded p-1.5 text-muted hover:bg-slate-100 hover:text-accent"
                  aria-label={`Edit ${exp.title}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(exp)}
                  disabled={deletingId === exp.id}
                  className="rounded p-1.5 text-muted hover:bg-slate-100 hover:text-warning"
                  aria-label={`Delete ${exp.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
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

const CHIP_STYLES = {
  attended: "border-accent/30 bg-accent/10 text-accent",
  absent: "border-slate-200 bg-white text-slate-500",
  confirmed: "border-accent/30 bg-accent/10 text-accent",
  pending: "border-warning/30 bg-warning/10 text-warning",
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
          <span
            key={attendee.name}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium",
              CHIP_STYLES[variant]
            )}
          >
            {attendee.name}
          </span>
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
    <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-slate-50",
          open && "border-b border-border"
        )}
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
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
}: {
  outing: Outing;
  past: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);

  const attended = outing.attendees.filter((a) => a.confirmed);
  const absent = outing.attendees.filter((a) => !a.confirmed);
  const expenses = outing.expenses ?? [];

  const yesLabel = past ? "Attended" : "Members";
  const noLabel = past ? "Not attended" : "Pending";

  return (
    <Card className={cn(past && "border-slate-200/80 bg-slate-50/40")}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="min-w-0 flex-1 text-left transition-colors hover:opacity-90"
          aria-expanded={expanded}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">{outing.title}</h2>
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
            <span className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              {formatCurrency(outing.budget)}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0" />
              {outing.attendees.length} members
            </span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-muted hover:bg-slate-100 hover:text-accent"
            aria-label={`Edit ${outing.title}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="rounded p-1.5 text-muted hover:bg-slate-100"
            aria-label={expanded ? "Collapse outing" : "Expand outing"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="mt-4">
            <BudgetStrip outing={outing} />
          </div>

          <CollapsibleSection
            className="mt-4"
            open={expensesOpen}
            onToggle={() => setExpensesOpen(!expensesOpen)}
            icon={<Receipt className="h-4 w-4 text-muted" />}
            title={`Expenses (${expenses.length})`}
          >
            <ExpenseList outing={outing} expenses={expenses} onChanged={onChanged} />
          </CollapsibleSection>

          <CollapsibleSection
            className="mt-4"
            open={membersOpen}
            onToggle={() => setMembersOpen(!membersOpen)}
            title={
              <>
                {yesLabel} ({attended.length})
                {absent.length > 0 && ` · ${noLabel} (${absent.length})`}
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
      />
    </Card>
  );
}

export default function OutingsPage() {
  const { store, loading, error, reload } = useDashboard();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { upcoming, past } = useMemo(
    () => sortOutings(store?.outings ?? []),
    [store?.outings]
  );

  if (loading) {
    return <div className="text-sm text-muted">Loading outings...</div>;
  }

  if (error || !store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load outings"}</div>;
  }

  return (
    <div>
      <PageHeader
        title="Team Outings"
        description="Track budget, attendance, and follow-up snack spend"
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
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
      />

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            Upcoming
          </h2>
          <div className="space-y-4">
            {upcoming.map((outing) => (
              <OutingCard key={outing.id} outing={outing} past={false} onChanged={reload} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            Past outings
          </h2>
          <div className="space-y-4">
            {past.map((outing) => (
              <OutingCard key={outing.id} outing={outing} past={true} onChanged={reload} />
            ))}
          </div>
        </section>
      )}

      {store.outings.length === 0 && (
        <Card className="py-12 text-center text-sm text-muted">
          No outings yet. Create one to get started.
        </Card>
      )}
    </div>
  );
}
