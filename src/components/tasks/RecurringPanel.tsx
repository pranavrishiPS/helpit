"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Repeat } from "lucide-react";
import type { RecurringTask } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  FieldError,
  Input,
  Label,
  Modal,
  Select,
  Tabs,
  Textarea,
  fieldClasses,
} from "@/components/ui";
import { DateCommitInput } from "@/components/ui/DateCommitInput";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";
import {
  WEEKDAY_FULL,
  WEEKDAY_ORDER,
  WEEKDAY_PRESET,
  WEEKDAY_SHORT,
  WEEK_OF_MONTH_LABELS,
  cleanRuleFields,
  nextOccurrence,
  ruleSummary,
  upcomingDates,
  validateRule,
  type RecurringRuleFields,
  type RecurringRulePatch,
  type RuleErrorField,
  type RuleErrors,
} from "@/lib/recurrence";
import {
  draftFromRule,
  draftToFields,
  draftToPatch,
  newDraft,
  toggleWeekday,
  type RuleDraft,
} from "@/lib/recurrence-draft";
import { formatDayChip, shiftDayKey, todayKey } from "@/lib/task-board";
import type { RuleMutationResult } from "@/lib/use-dashboard";
import { useDialogA11y } from "./useDialogA11y";

const HIGHLIGHT_MS = 2000;

/** Element id to focus for each field error (first error wins on Save). */
const FIELD_IDS: Record<RuleErrorField, string> = {
  title: "rule-title",
  comment: "rule-comment",
  cadence: "rule-title",
  weekdays: "rule-day-first",
  monthlyMode: "rule-title",
  weekOfMonth: "rule-week-of-month",
  dayOfMonth: "rule-day-of-month",
  startDate: "rule-start",
  endDate: "rule-end",
};
const FIELD_ORDER: RuleErrorField[] = [
  "title",
  "cadence",
  "monthlyMode",
  "weekdays",
  "weekOfMonth",
  "dayOfMonth",
  "startDate",
  "endDate",
  "comment",
];

interface RuleRow {
  rule: RecurringTask;
  next?: string;
  ended: boolean;
}

/** Active rules by next date (soonest first), then paused, then ended. */
function rankRules(rules: RecurringTask[], today: string): RuleRow[] {
  const dayBefore = shiftDayKey(today, -1);
  const rows = rules.map((rule): RuleRow => {
    const next = nextOccurrence(rule, dayBefore);
    const ended = Boolean(rule.endDate) && (rule.endDate! < today || next === undefined);
    return { rule, next, ended };
  });
  const group = (r: RuleRow) => (r.ended ? 2 : r.rule.active ? 0 : 1);
  return rows.sort((a, b) => {
    if (group(a) !== group(b)) return group(a) - group(b);
    if (group(a) === 0 && a.next !== b.next) {
      if (a.next === undefined) return 1;
      if (b.next === undefined) return -1;
      return a.next.localeCompare(b.next);
    }
    return a.rule.createdAt.localeCompare(b.rule.createdAt);
  });
}

interface RecurringPanelProps {
  rules: RecurringTask[];
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onCreate: (fields: RecurringRuleFields) => Promise<RuleMutationResult>;
  onUpdate: (id: string, patch: RecurringRulePatch) => Promise<RuleMutationResult>;
  onDelete: (id: string) => Promise<RuleMutationResult>;
}

/**
 * "Recurring tasks" panel (docs/specs/recurring-tasks.md §9). One Modal swaps between the rule
 * list and the new/edit form (no stacked dialogs). Escape leaves the form, then closes the panel.
 */
export function RecurringPanel({
  rules,
  onClose,
  returnFocusRef,
  onCreate,
  onUpdate,
  onDelete,
}: RecurringPanelProps) {
  const titleId = useId();
  const today = todayKey();

  // null = list view.
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<RuleErrorField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [listError, setListError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inForm = draft !== null;
  const { anchorRef, focusInitial } = useDialogA11y({
    returnFocusRef,
    onEscape: () => (inForm ? leaveForm() : onClose()),
  });

  // Focus Title (form) or the first rule (list) whenever the view changes.
  useEffect(() => {
    focusInitial();
    // focusInitial only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inForm]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    []
  );

  const rows = useMemo(() => rankRules(rules, today), [rules, today]);

  function openForm(next: RuleDraft) {
    setDraft(next);
    setTouched(new Set());
    setSubmitted(false);
    setFormError(null);
  }

  function leaveForm() {
    setDraft(null);
    setFormError(null);
  }

  function flashRow(id: string) {
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  }

  async function runRow(id: string, action: () => Promise<RuleMutationResult>): Promise<boolean> {
    setListError(null);
    setPending((prev) => new Set(prev).add(id));
    try {
      const result = await action();
      if (!result.ok) {
        setListError(result.error);
        return false;
      }
      return true;
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function markTouched(field: RuleErrorField) {
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || saving) return;
    setSubmitted(true);
    const errors = validateRule(draftToFields(draft));
    const firstField = FIELD_ORDER.find((f) => errors[f]);
    if (firstField) {
      document.getElementById(FIELD_IDS[firstField])?.focus();
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = draft.id
        ? await onUpdate(draft.id, draftToPatch(draft))
        : await onCreate(cleanRuleFields(draftToFields(draft)));
      if (!result.ok) {
        setFormError(result.error); // the form stays open with the draft
        return;
      }
      leaveForm();
      flashRow(result.id);
    } finally {
      setSaving(false);
    }
  }

  const errors: RuleErrors = draft ? validateRule(draftToFields(draft)) : {};
  const shown = (field: RuleErrorField) =>
    errors[field] && (submitted || touched.has(field)) ? errors[field] : undefined;

  const footer = inForm ? (
    <>
      <Button variant="secondary" onClick={leaveForm}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save rule"}
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
      {rows.length > 0 && (
        <Button variant="primary" onClick={() => openForm(newDraft(today))}>
          New recurring task
        </Button>
      )}
    </>
  );

  return (
    <Modal
      onClose={onClose}
      module="tasks"
      icon={Repeat}
      className="max-w-xl"
      titleId={titleId}
      title={draft ? (draft.id ? "Edit recurring task" : "New recurring task") : "Recurring tasks"}
      onSubmit={inForm ? submit : undefined}
      footer={footer}
    >
      <span ref={anchorRef} hidden />
      {draft ? (
        <RuleForm
          draft={draft}
          setDraft={setDraft}
          today={today}
          formError={formError}
          shown={shown}
          markTouched={markTouched}
          onDateCommit={(field, value) => {
            setDraft((d) => (d ? { ...d, [field]: value } : d));
            markTouched(field === "startDate" ? "startDate" : "endDate");
          }}
        />
      ) : (
        <>
          {listError && <ErrorBanner message={listError} onDismiss={() => setListError(null)} className="mb-0" />}
          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={Repeat}
              title="No recurring tasks yet"
              description="Set a rule once and the task shows up on the right day."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  data-autofocus=""
                  onClick={() => openForm(newDraft(today))}
                >
                  New recurring task
                </Button>
              }
            />
          ) : (
            <ul className="overflow-hidden rounded-control border border-border bg-card">
              {rows.map((row, index) => (
                <RuleListRow
                  key={row.rule.id}
                  row={row}
                  first={index === 0}
                  busy={pending.has(row.rule.id)}
                  confirming={confirmId === row.rule.id}
                  highlighted={highlightId === row.rule.id}
                  onEdit={() => openForm(draftFromRule(row.rule))}
                  onToggle={() =>
                    void runRow(row.rule.id, () =>
                      onUpdate(row.rule.id, { active: !row.rule.active })
                    )
                  }
                  onAskDelete={() => setConfirmId(row.rule.id)}
                  onCancelDelete={() => setConfirmId(null)}
                  onDelete={async () => {
                    const ok = await runRow(row.rule.id, () => onDelete(row.rule.id));
                    if (ok) setConfirmId(null);
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* List row                                                            */
/* ------------------------------------------------------------------ */

function RuleListRow({
  row,
  first,
  busy,
  confirming,
  highlighted,
  onEdit,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  row: RuleRow;
  first: boolean;
  busy: boolean;
  confirming: boolean;
  highlighted: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const { rule, next, ended } = row;
  const paused = !rule.active && !ended;
  const dim = paused || ended;
  const items: MenuItem[] = [
    { id: "edit", label: "Edit", onSelect: onEdit },
    { id: "delete", label: "Delete", destructive: true, onSelect: onAskDelete },
  ];

  const detail = ended ? "Next: -" : paused ? "Paused" : next ? `Next: ${formatDayChip(next)}` : "Next: -";

  return (
    <li
      className={cn(
        "border-t border-border px-3 py-2 transition-colors first:border-t-0",
        confirming ? "bg-danger-soft" : highlighted ? "bg-success-soft/60" : "hover:bg-surface-2/60",
        dim && !confirming && "opacity-70",
        busy && "pointer-events-none opacity-60"
      )}
    >
      {confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="alert" className="min-w-0 flex-1 text-sm font-medium text-danger">
            Delete this rule? Its remaining rows become plain tasks.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancelDelete} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={onDelete} disabled={busy}>
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={onEdit}
                data-autofocus={first ? "" : undefined}
                title="Edit"
                className="min-w-0 truncate rounded-chip text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                {rule.title}
              </button>
              {ended ? (
                <Badge tone="neutral">Ended</Badge>
              ) : paused ? (
                <Badge tone="neutral">Paused</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 break-words text-xs tabular-nums text-muted">
              {ruleSummary(rule)} · {detail}
            </p>
          </div>
          {!ended && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              disabled={busy}
              aria-label={`${rule.active ? "Pause" : "Resume"} ${rule.title}`}
            >
              {rule.active ? "Pause" : "Resume"}
            </Button>
          )}
          <Menu
            label={`Actions for ${rule.title}`}
            icon={MoreHorizontal}
            items={items}
            disabled={busy}
            triggerClassName="shrink-0"
          />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

function WeekdayToggles({
  selected,
  onChange,
  idFirst,
}: {
  selected: readonly number[];
  onChange: (next: number[]) => void;
  idFirst?: boolean;
}) {
  return (
    <div role="group" aria-label="Days" className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap">
      {WEEKDAY_ORDER.map((day, index) => {
        const on = selected.includes(day);
        return (
          <Button
            key={day}
            id={idFirst && index === 0 ? "rule-day-first" : undefined}
            variant="secondary"
            size="sm"
            aria-pressed={on}
            aria-label={WEEKDAY_FULL[day]}
            onClick={() => onChange(toggleWeekday(selected, day))}
            className={cn(
              "max-sm:h-11",
              on && "border-signal bg-accent-soft text-accent hover:bg-accent-soft"
            )}
          >
            {WEEKDAY_SHORT[day]}
          </Button>
        );
      })}
    </div>
  );
}

function RuleForm({
  draft,
  setDraft,
  today,
  formError,
  shown,
  markTouched,
  onDateCommit,
}: {
  draft: RuleDraft;
  setDraft: React.Dispatch<React.SetStateAction<RuleDraft | null>>;
  today: string;
  formError: string | null;
  shown: (field: RuleErrorField) => string | undefined;
  markTouched: (field: RuleErrorField) => void;
  onDateCommit: (field: "startDate" | "endDate", value: string) => void;
}) {
  const set = (patch: Partial<RuleDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const weekdayError = shown("weekdays");

  const preview = useMemo(() => {
    const fields = draftToFields(draft);
    const errors = validateRule(fields);
    delete errors.title;
    delete errors.comment;
    if (errors.weekdays) return { text: "Pick at least one day to see dates." };
    if (Object.keys(errors).length > 0) return { text: "Fill in the highlighted fields to see dates." };
    const cleaned = cleanRuleFields(fields);
    const rule: RecurringTask = {
      ...cleaned,
      id: "preview",
      title: cleaned.title || "Preview",
      active: true,
      createdAt: "",
      updatedAt: "",
    };
    const dates = upcomingDates(rule, today, 3);
    return {
      summary: ruleSummary(rule),
      dates,
      text: dates.length === 0 ? "No upcoming dates." : undefined,
    };
  }, [draft, today]);

  return (
    <>
      {formError && <ErrorBanner message={formError} className="mb-0" />}

      <div>
        <Label htmlFor="rule-title">Title *</Label>
        <Input
          id="rule-title"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          onBlur={() => markTouched("title")}
          aria-invalid={Boolean(shown("title"))}
          aria-describedby={shown("title") ? "rule-title-error" : undefined}
          maxLength={500}
          data-autofocus=""
          autoComplete="off"
        />
        {shown("title") && <div id="rule-title-error"><FieldError>{shown("title")}</FieldError></div>}
      </div>

      <div>
        <Label htmlFor="rule-comment" hint="optional">
          Comment
        </Label>
        <Textarea
          id="rule-comment"
          rows={2}
          value={draft.comment}
          onChange={(e) => set({ comment: e.target.value })}
          maxLength={5000}
        />
      </div>

      <div>
        <GroupLabel>Repeats</GroupLabel>
        <Tabs
          aria-label="Repeats"
          value={draft.cadence}
          onChange={(cadence) => set({ cadence })}
          items={[
            { id: "daily", label: "Daily" },
            { id: "weekly", label: "Weekly" },
            { id: "monthly", label: "Monthly" },
          ]}
        />
      </div>

      {draft.cadence === "weekly" && (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <GroupLabel className="mb-0">Days</GroupLabel>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                set({ weekdays: [...WEEKDAY_PRESET] });
                markTouched("weekdays");
              }}
            >
              Weekdays
            </Button>
          </div>
          <WeekdayToggles
            idFirst
            selected={draft.weekdays}
            onChange={(weekdays) => {
              set({ weekdays });
              markTouched("weekdays");
            }}
          />
          {weekdayError && <FieldError>{weekdayError}</FieldError>}
        </div>
      )}

      {draft.cadence === "monthly" && (
        <>
          <div>
            <GroupLabel>Mode</GroupLabel>
            <Tabs
              aria-label="Monthly mode"
              value={draft.monthlyMode}
              onChange={(monthlyMode) => set({ monthlyMode })}
              items={[
                { id: "weekday_of_month", label: "On week" },
                { id: "day_of_month", label: "On day" },
              ]}
            />
          </div>

          {draft.monthlyMode === "weekday_of_month" ? (
            <>
              <div>
                <Label htmlFor="rule-week-of-month">Week of the month</Label>
                <Select
                  id="rule-week-of-month"
                  value={String(draft.weekOfMonth)}
                  onChange={(e) =>
                    set({
                      weekOfMonth:
                        e.target.value === "last"
                          ? "last"
                          : (Number(e.target.value) as 1 | 2 | 3 | 4),
                    })
                  }
                >
                  {Object.entries(WEEK_OF_MONTH_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <GroupLabel>Days</GroupLabel>
                <WeekdayToggles
                  idFirst
                  selected={draft.weekdays}
                  onChange={(weekdays) => {
                    set({ weekdays });
                    markTouched("weekdays");
                  }}
                />
                {weekdayError && <FieldError>{weekdayError}</FieldError>}
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="rule-day-of-month">Day of month</Label>
              <Input
                id="rule-day-of-month"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={draft.dayOfMonth}
                onChange={(e) => set({ dayOfMonth: e.target.value })}
                onBlur={() => markTouched("dayOfMonth")}
                aria-invalid={Boolean(shown("dayOfMonth"))}
              />
              {shown("dayOfMonth") && <FieldError>{shown("dayOfMonth")}</FieldError>}
            </div>
          )}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rule-start">Starts</Label>
          <DateCommitInput
            id="rule-start"
            aria-label="Starts"
            value={draft.startDate}
            onCommit={(value) => onDateCommit("startDate", value)}
            className={fieldClasses()}
          />
          {shown("startDate") && <FieldError>{shown("startDate")}</FieldError>}
        </div>
        <div>
          <Label htmlFor="rule-end" hint="optional">
            Ends
          </Label>
          <DateCommitInput
            id="rule-end"
            aria-label="Ends"
            value={draft.endDate}
            min={draft.startDate || undefined}
            onCommit={(value) => onDateCommit("endDate", value)}
            className={fieldClasses()}
          />
          {shown("endDate") && <FieldError>{shown("endDate")}</FieldError>}
        </div>
      </div>

      <div
        aria-live="polite"
        className="rounded-control bg-surface-2/60 px-3 py-2 text-xs text-muted max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:bg-surface-2 max-sm:ring-1 max-sm:ring-inset max-sm:ring-border"
      >
        {"summary" in preview && <p>Preview: <span className="text-foreground">{preview.summary}</span></p>}
        {"dates" in preview && preview.dates && preview.dates.length > 0 ? (
          <p className="mt-0.5 tabular-nums">
            Next:{" "}
            {preview.dates.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <span className="text-foreground">{formatDayChip(d)}</span>
              </span>
            ))}
          </p>
        ) : (
          <p>{preview.text}</p>
        )}
      </div>
    </>
  );
}

/** Caption for a group of buttons (a <label> needs a single control to point at). */
function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-1.5 text-xs font-semibold text-foreground", className)}>{children}</p>;
}
