"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Table2,
  X,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  FieldError,
  Input,
  Label,
  Modal,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/cn";
import { useDashboard } from "@/lib/use-dashboard";
import { updateCapacityPlan } from "@/lib/api-client";
import {
  HEADCOUNT_KEYS,
  HEADCOUNT_LABELS,
  HEADCOUNT_SHORT_LABELS,
  capacityTotals,
  formatNumber,
  monthMandays,
  parseNonNegative,
  potentialDays,
} from "@/lib/lrp-2027";
import {
  averagePotential,
  capacityDraftReducer,
  changedFields,
  draftPatch,
  initDraft,
  samePlanValues,
  thinMonths,
  type CapacityDraftAction,
  type CapacityDraftState,
  type CapacityEdit,
  type MonthField,
} from "@/lib/capacity-draft";
import type { CapacityHeadcount, CapacityMonth, CapacityPlan } from "@/lib/types";
import { CELL } from "./grid";
import { useDraftSession, type Validity } from "./draft-ui";

// 2027 Planning > Capacity Plan v2 (docs/specs/planning-2027.md §9.2, §10.4): a dashboard with a
// local draft (Undo/Redo, explicit Save), not a sheet. Formulas are unchanged (lib/lrp-2027.ts).

const MONTH_FIELDS: { key: MonthField; label: string; short: string }[] = [
  { key: "workingDays", label: "Working days", short: "Working" },
  { key: "holidays", label: "Holidays", short: "Holidays" },
  { key: "leaves", label: "Leaves", short: "Leaves" },
];

const NEGATIVE_POTENTIAL = "Leaves + holidays exceed working days.";
const FULL_TABLE_KEY = "helpit-capacity-full-table";
const FLASH_MS = 600;

function draftReducer(
  state: CapacityDraftState | null,
  action: CapacityDraftAction
): CapacityDraftState | null {
  if (action.type === "reset") return initDraft(action.plan);
  return state ? capacityDraftReducer(state, action) : state;
}

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return phone;
}

/* ------------------------------------------------------------------ */
/* Draft input: plain text, no spinner / wheel / arrow-key changes      */
/* ------------------------------------------------------------------ */

function validateValue(text: string, kind: "decimal" | "count" | "year"): { value?: number; error?: string } {
  const parsed = parseNonNegative(text);
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.value === undefined) return { error: "Enter a number." };
  if (kind === "year") {
    if (!Number.isInteger(parsed.value)) return { error: "Enter a whole number." };
    if (parsed.value < 2000 || parsed.value > 2100) return { error: "Enter a year from 2000 to 2100." };
  }
  return { value: parsed.value };
}

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function DraftInput({
  fieldKey,
  value,
  kind = "decimal",
  changed,
  disabled,
  onCommit,
  onValidity,
  onTextChange,
  initialFocus,
  className,
  wrapperClassName,
  ...rest
}: {
  fieldKey: string;
  value: number;
  kind?: "decimal" | "count" | "year";
  changed?: boolean;
  disabled?: boolean;
  onCommit: (value: number) => void;
  onValidity: Validity;
  /** Live text while typing (e.g. to preview Potential before commit). */
  onTextChange?: (text: string) => void;
  /** Marks the field the popover focuses once it is visible. */
  initialFocus?: boolean;
  className?: string;
  wrapperClassName?: string;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "id" | "aria-label" | "autoFocus">) {
  const errorId = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const before = useRef(String(value));
  const focused = useRef(false);

  // Undo/redo/reload change the value from outside: show it unless the user is typing.
  useEffect(() => {
    if (focused.current) return;
    setText(String(value));
    before.current = String(value);
    setError(null);
    onValidity(fieldKey, false);
  }, [value, fieldKey, onValidity]);

  useEffect(() => () => onValidity(fieldKey, false), [fieldKey, onValidity]);

  function commit() {
    const result = validateValue(text, kind);
    if (result.error) {
      setError(result.error);
      onValidity(fieldKey, true);
      return;
    }
    setError(null);
    onValidity(fieldKey, false);
    setText(String(result.value));
    // Esc now reverts to this committed (draft) value, never to the pre-commit one.
    before.current = String(result.value);
    if (result.value !== value) onCommit(result.value!);
  }

  return (
    <span className={cn("block", wrapperClassName)}>
      <span className="relative flex items-center">
        {changed && !error && (
          <span aria-hidden="true" className="absolute -left-2.5 h-1.5 w-1.5 rounded-full bg-accent" />
        )}
        <Input
          {...rest}
          size="sm"
          type="text"
          inputMode={kind === "decimal" ? "decimal" : "numeric"}
          autoComplete="off"
          data-field-key={fieldKey}
          disabled={disabled}
          value={text}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => {
            focused.current = true;
            before.current = text;
          }}
          data-autofocus={initialFocus || undefined}
          onChange={(e) => {
            setText(e.target.value);
            onTextChange?.(e.target.value);
          }}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape" && (text !== before.current || error)) {
              // First Esc reverts the field; with nothing to revert it reaches the popover/sheet.
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              setText(before.current);
              onTextChange?.(before.current);
              setError(null);
              onValidity(fieldKey, false);
            }
          }}
          className={cn(
            "px-1 text-center font-medium tabular-nums text-info",
            changed && !error && "ring-1 ring-inset ring-accent",
            error && "border-danger bg-danger-soft",
            className
          )}
        />
        {changed && !error && <span className="sr-only">edited</span>}
      </span>
      {error && (
        <FieldError className="mt-1 text-[11px]">
          <span id={errorId}>{error}</span>
        </FieldError>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function CapacityPlanView() {
  const { store, loading, error, reload } = useDashboard();
  const isPhone = useIsPhone();
  const [state, dispatch] = useReducer(draftReducer, null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [flash, setFlash] = useState<keyof CapacityHeadcount | null>(null);
  const [fullTableOpen, setFullTableOpen] = useState(false);
  const monthRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const changes = state ? changedFields(state.saved, state.draft) : [];

  const session = useDraftSession({
    changeCount: changes.length,
    canUndo: Boolean(state && state.past.length > 0),
    canRedo: Boolean(state && state.future.length > 0),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    discard: () => {
      const s = stateRef.current;
      if (s) dispatch({ type: "reset", plan: s.saved });
    },
    persist: async () => {
      const s = stateRef.current;
      const patch = s && draftPatch(s.saved, s.draft);
      if (!patch) return;
      const plan = await updateCapacityPlan(patch);
      dispatch({ type: "reset", plan });
    },
    reloadFromServer: () => {
      if (store?.capacityPlan) dispatch({ type: "reset", plan: store.capacityPlan });
    },
    noun: "Plan",
  });
  const { setExternalChange } = session;

  // Take server data; keep a dirty draft and say the plan changed elsewhere instead.
  useEffect(() => {
    const plan = store?.capacityPlan;
    if (!plan) return;
    const s = stateRef.current;
    if (!s) {
      dispatch({ type: "reset", plan });
      return;
    }
    if (samePlanValues(plan, s.saved)) return;
    if (changedFields(s.saved, s.draft).length > 0) setExternalChange(true);
    else dispatch({ type: "reset", plan });
  }, [store, setExternalChange]);

  useEffect(() => {
    try {
      setFullTableOpen(window.localStorage.getItem(FULL_TABLE_KEY) === "open");
    } catch {
      // Blocked storage: default closed.
    }
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  if (loading) return <CapacitySkeleton />;

  if (!store) {
    return (
      <Alert
        tone="danger"
        role="alert"
        action={
          <Button variant="ghost" size="sm" className="-my-1 h-7 text-current" onClick={() => void reload()}>
            Retry
          </Button>
        }
      >
        Couldn&apos;t load the capacity plan.{error ? ` ${error}` : ""}
      </Alert>
    );
  }

  if (!store.capacityPlan || !state) {
    return (
      <div>
        <PageHeader title="Capacity Plan" module="lrp2027" />
        <Card>
          <EmptyState
            icon={Table2}
            title="No capacity plan yet"
            description="The plan comes from the Cryptogram LRP 2027 sheet."
          />
        </Card>
      </div>
    );
  }

  const plan = state.draft;
  const saving = session.saving;
  const invalid = session.invalid;
  const onValidity = session.onValidity;
  const changedSet = new Set(changes);
  const totals = capacityTotals(plan);
  const thin = new Set(thinMonths(plan.months));
  const avg = averagePotential(plan.months);

  function edit(e: CapacityEdit) {
    session.clearSaveError();
    dispatch({ type: "edit", edit: e });
  }

  function setHeadcount(key: keyof CapacityHeadcount, value: number) {
    setFlash(key);
    edit({ kind: "headcount", key, value });
  }

  function closeMonth(refocus = true) {
    const index = openMonth;
    setOpenMonth(null);
    if (refocus && index != null) requestAnimationFrame(() => monthRefs.current[index]?.focus());
  }

  function toggleFullTable() {
    const next = !fullTableOpen;
    setFullTableOpen(next);
    try {
      window.localStorage.setItem(FULL_TABLE_KEY, next ? "open" : "closed");
    } catch {
      // Not remembered when storage is blocked.
    }
  }

  return (
    <div className={cn("space-y-4", session.dirty && "max-sm:pb-20")}>
      <div className="-mb-2">
        <PageHeader
          title={`Capacity Plan ${plan.year}`}
          module="lrp2027"
          description="How many mandays each function has, and which months are thin."
          action={session.headerActions()}
        />
      </div>

      {session.alerts}

      <ByFunctionCard
        plan={plan}
        totals={totals}
        thin={thin}
        flash={flash}
        changedSet={changedSet}
        disabled={saving}
        onHeadcount={setHeadcount}
        onValidity={onValidity}
      />

      <MonthsCard
        plan={plan}
        avg={avg}
        thin={thin}
        openMonth={openMonth}
        monthRefs={monthRefs}
        onOpen={setOpenMonth}
      />

      <FullTable
        open={fullTableOpen}
        onToggle={toggleFullTable}
        plan={plan}
        totals={totals}
        changedSet={changedSet}
        disabled={saving}
        onEdit={edit}
        onValidity={onValidity}
      />

      {openMonth != null && (
        <MonthEditor
          key={openMonth}
          plan={plan}
          index={openMonth}
          phone={isPhone}
          anchor={monthRefs.current[openMonth] ?? null}
          changedSet={changedSet}
          invalid={invalid}
          disabled={saving}
          onEdit={edit}
          onValidity={onValidity}
          onMove={(next) => {
            setOpenMonth(next);
          }}
          onClose={closeMonth}
        />
      )}

      {session.mobileBar}
      {session.modals}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 1: By function                                                 */
/* ------------------------------------------------------------------ */

function ByFunctionCard({
  plan,
  totals,
  thin,
  flash,
  changedSet,
  disabled,
  onHeadcount,
  onValidity,
}: {
  plan: CapacityPlan;
  totals: ReturnType<typeof capacityTotals>;
  thin: Set<number>;
  flash: keyof CapacityHeadcount | null;
  changedSet: Set<string>;
  disabled: boolean;
  onHeadcount: (key: keyof CapacityHeadcount, value: number) => void;
  onValidity: Validity;
}) {
  const monthly = plan.months.map((m) => monthMandays(m, plan.headcount));
  const headcountSum = HEADCOUNT_KEYS.reduce((sum, k) => sum + plan.headcount[k], 0);
  const grid = "grid grid-cols-[1fr_4rem_5rem] items-center gap-x-4 px-4 sm:grid-cols-[6.5rem_5.5rem_1fr_6rem]";

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <CardHeader
        title="By function"
        className="mb-0 px-4 pb-3 pt-4"
        action={<span className="text-xs text-muted">Mandays in {plan.year}</span>}
      />
      <div role="table" aria-label={`Mandays by function in ${plan.year}`}>
        <div
          role="row"
          className={cn(grid, "h-8 bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted")}
        >
          <span role="columnheader">Function</span>
          <span role="columnheader" className="text-center">
            Headcount
          </span>
          <span role="columnheader" aria-label="By month" className="hidden gap-1 sm:flex">
            {MONTH_INITIALS.map((m, i) => (
              <span key={i} aria-hidden="true" className="max-w-7 flex-1 text-center tracking-normal">
                <span className="lg:hidden">{m}</span>
                <span className="hidden normal-case lg:inline">{plan.months[i]?.label.slice(0, 3) ?? m}</span>
              </span>
            ))}
          </span>
          <span role="columnheader" className="text-right">
            Mandays/yr
          </span>
        </div>
        <div className="divide-y divide-border">
          {HEADCOUNT_KEYS.map((key) => {
            const values = monthly.map((m) => m[key]);
            const max = Math.max(...values, 0);
            return (
              <div
                key={key}
                role="row"
                className={cn(grid, "min-h-11 py-1.5 transition-colors duration-[600ms]", flash === key && "bg-accent-soft")}
              >
                <span role="rowheader" title={HEADCOUNT_LABELS[key]} className="truncate text-sm font-medium text-foreground">
                  {HEADCOUNT_SHORT_LABELS[key]}
                </span>
                <span role="cell" className="flex justify-center">
                  <DraftInput
                    fieldKey={`headcount.${key}`}
                    aria-label={`${HEADCOUNT_LABELS[key]} headcount`}
                    kind="count"
                    value={plan.headcount[key]}
                    changed={changedSet.has(`headcount.${key}`)}
                    disabled={disabled}
                    onCommit={(v) => onHeadcount(key, v)}
                    onValidity={onValidity}
                    wrapperClassName="w-9 max-sm:w-11"
                    className="max-sm:h-10"
                  />
                </span>
                <span
                  role="img"
                  aria-label={`${HEADCOUNT_LABELS[key]} mandays by month: ${plan.months
                    .map((m, i) => `${m.label} ${formatNumber(values[i])}`)
                    .join(", ")}`}
                  className="hidden h-8 items-end gap-1 sm:flex"
                >
                  {values.map((v, i) => (
                    <span
                      key={i}
                      title={`${plan.months[i].label}: ${formatNumber(v)} mandays · ${formatNumber(potentialDays(plan.months[i]))} potential days per person`}
                      style={{ height: v < 0 ? "0px" : max > 0 && v > 0 ? `max(2px, ${(v / max) * 100}%)` : "2px" }}
                      className={cn(
                        "flex max-w-7 flex-1 items-end justify-center rounded-t-[3px] pb-0.5 text-[9px] font-semibold leading-none tabular-nums text-background transition-[height] duration-300",
                        thin.has(i) ? "bg-caution-mark" : "bg-info"
                      )}
                    >
                      {v > 0 ? potentialDays(plan.months[i]).toFixed(1) : null}
                    </span>
                  ))}
                </span>
                <span role="cell" className="text-right text-base font-semibold tabular-nums text-foreground">
                  {formatNumber(totals[key])}
                </span>
              </div>
            );
          })}
          <div role="row" className={cn(grid, "h-11 bg-surface-2 font-semibold")}>
            <span role="rowheader" className="text-[11px] uppercase tracking-[0.06em] text-muted">
              Total
            </span>
            <span role="cell" className="text-center text-sm tabular-nums text-foreground">
              {formatNumber(headcountSum)}
            </span>
            <span role="cell" className="hidden sm:block" />
            <span role="cell" className="text-right text-base tabular-nums text-foreground">
              {formatNumber(HEADCOUNT_KEYS.reduce((sum, k) => sum + totals[k], 0))}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Card 2: Months strip                                                */
/* ------------------------------------------------------------------ */

function MonthsCard({
  plan,
  avg,
  thin,
  openMonth,
  monthRefs,
  onOpen,
}: {
  plan: CapacityPlan;
  avg: number;
  thin: Set<number>;
  openMonth: number | null;
  monthRefs: React.RefObject<(HTMLButtonElement | null)[]>;
  onOpen: (index: number) => void;
}) {
  const [focusIndex, setFocusIndex] = useState(0);
  const potentials = plan.months.map(potentialDays);
  const max = Math.max(...potentials, avg, 0);
  const thinList = plan.months
    .map((m, i) => ({ m, i }))
    .filter(({ i }) => thin.has(i) && potentials[i] >= 0);
  const overList = plan.months.map((m, i) => ({ m, i })).filter(({ i }) => potentials[i] < 0);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + plan.months.length) % plan.months.length;
    setFocusIndex(next);
    monthRefs.current[next]?.focus();
  }

  return (
    <Card className="p-4 sm:p-4">
      <CardHeader
        title="Months"
        className="mb-3"
        action={
          <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              <span className="font-semibold text-foreground">Potential</span> days per person · avg {formatNumber(avg)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-medium leading-4 text-muted ring-1 ring-inset ring-border">
                Working
              </span>
              days
            </span>
          </span>
        }
      />
      <div className="grid grid-cols-6 gap-2 gap-y-3 sm:grid-cols-12">
        {plan.months.map((month, i) => {
          const p = potentials[i];
          const negative = p < 0;
          const isThin = thin.has(i) && !negative;
          return (
            <button
              key={i}
              ref={(el) => {
                monthRefs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focusIndex ? 0 : -1}
              aria-haspopup="dialog"
              aria-expanded={openMonth === i}
              aria-label={`${month.label}, ${formatNumber(p)} potential days, ${formatNumber(month.workingDays)} working days${isThin ? ", thin" : ""}${negative ? `, ${NEGATIVE_POTENTIAL}` : ""}. Edit`}
              title={negative ? NEGATIVE_POTENTIAL : undefined}
              onFocus={() => setFocusIndex(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onOpen(i)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-control p-1.5 transition-colors hover:bg-surface-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
                openMonth === i && "bg-surface-2 ring-1 ring-border-strong"
              )}
            >
              <span className="flex h-4 items-center">
                {isThin && (
                  <Badge tone="caution" className="px-1.5 py-0 text-[10px] leading-4">
                    Thin
                  </Badge>
                )}
              </span>
              <span className="relative flex h-16 w-full max-w-8 items-end rounded-[4px] bg-surface-2 sm:h-24">
                <span
                  aria-hidden="true"
                  style={{ height: max > 0 && p > 0 ? `${(p / max) * 100}%` : "0%" }}
                  className={cn(
                    "w-full rounded-[4px] transition-[height] duration-300",
                    isThin ? "bg-caution-mark" : "bg-info"
                  )}
                />
                {max > 0 && (
                  <span
                    aria-hidden="true"
                    style={{ bottom: `${(avg / max) * 100}%` }}
                    className="absolute -inset-x-1 border-t border-dashed border-border-strong"
                  />
                )}
              </span>
              <span className="text-[11px] text-muted">{month.label}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums",
                  negative ? "text-danger" : isThin ? "text-caution" : "text-foreground"
                )}
              >
                {negative && <AlertTriangle aria-hidden="true" className="h-3 w-3" />}
                {formatNumber(p)}
              </span>
              <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-medium leading-4 tabular-nums text-muted ring-1 ring-inset ring-border">
                {formatNumber(month.workingDays)}
              </span>
            </button>
          );
        })}
      </div>
      {thinList.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-control bg-caution-soft px-3 py-2 text-xs text-caution">
          <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Thin:{" "}
            {thinList.map(({ m, i }, n) => (
              <span key={i}>
                {n > 0 && " · "}
                <span className="font-semibold">{m.label}</span> ({formatNumber(m.holidays)} holidays,{" "}
                {formatNumber(m.leaves)} leaves)
              </span>
            ))}
          </span>
        </p>
      )}
      {overList.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Over-allocated:{" "}
            {overList.map(({ m, i }, n) => (
              <span key={i}>
                {n > 0 && " · "}
                <span className="font-semibold">{m.label}</span> (leaves + holidays exceed working days)
              </span>
            ))}
          </span>
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">Click a month to edit working days, holidays, leaves.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Month editor: popover (desktop) / bottom sheet (phone)              */
/* ------------------------------------------------------------------ */

function MonthEditor({
  plan,
  index,
  phone,
  anchor,
  changedSet,
  invalid,
  disabled,
  onEdit,
  onValidity,
  onMove,
  onClose,
}: {
  plan: CapacityPlan;
  index: number;
  phone: boolean;
  anchor: HTMLElement | null;
  changedSet: Set<string>;
  invalid: Record<string, true>;
  disabled: boolean;
  onEdit: (e: CapacityEdit) => void;
  onValidity: Validity;
  onMove: (index: number) => void;
  onClose: (refocus?: boolean) => void;
}) {
  const titleId = useId();
  const month: CapacityMonth = plan.months[index];
  // Live preview: valid typed values count before they are committed to the draft.
  const [live, setLive] = useState<Partial<Record<MonthField, number>>>({});
  const p = potentialDays({ ...month, ...live });
  const keyFor = (field: MonthField) => `popover:month.${index}.${field}`;
  const blocked = MONTH_FIELDS.some((f) => invalid[keyFor(f.key)]);

  // Don't leave a month with an invalid field: focus it instead.
  function guarded(action: () => void) {
    if (blocked) {
      const first = MONTH_FIELDS.find((f) => invalid[keyFor(f.key)]);
      document.querySelector<HTMLInputElement>(`[data-field-key="${keyFor(first!.key)}"]`)?.focus();
      return;
    }
    action();
  }

  const fields = (
    <div className="grid grid-cols-[1fr_5rem] items-center gap-y-2">
      {MONTH_FIELDS.map((f, n) => (
        <div key={f.key} className="contents">
          <Label htmlFor={`${titleId}-${f.key}`} className="mb-0 text-xs">
            {f.label}
          </Label>
          <DraftInput
            id={`${titleId}-${f.key}`}
            fieldKey={keyFor(f.key)}
            value={month[f.key]}
            autoFocus={phone && n === 0}
            initialFocus={n === 0}
            onTextChange={(text) => {
              const parsed = parseNonNegative(text);
              setLive((current) => {
                const next = { ...current };
                if (parsed.ok && parsed.value !== undefined) next[f.key] = parsed.value;
                else delete next[f.key];
                return next;
              });
            }}
            changed={changedSet.has(`month.${index}.${f.key}`)}
            disabled={disabled}
            onCommit={(value) => onEdit({ kind: "month", index, field: f.key, value })}
            onValidity={onValidity}
            className="max-sm:h-10"
          />
        </div>
      ))}
      <span className="col-span-2 mt-1 flex items-center justify-between border-t border-border pt-2 text-xs text-muted">
        Potential
        <span
          title={p < 0 ? NEGATIVE_POTENTIAL : undefined}
          className={cn(
            "inline-flex items-center gap-1 text-sm font-semibold tabular-nums",
            p < 0 ? "text-danger" : "text-foreground"
          )}
        >
          {p < 0 && <AlertTriangle aria-hidden="true" className="h-3 w-3" />}
          {formatNumber(p)}
        </span>
      </span>
      {p < 0 && <p className="col-span-2 text-[11px] text-danger">{NEGATIVE_POTENTIAL}</p>}
    </div>
  );

  const footer = (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={index === 0}
        onClick={() => guarded(() => onMove(index - 1))}
      >
        <ChevronLeft aria-hidden="true" />
        Prev
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={index === plan.months.length - 1}
        onClick={() => guarded(() => onMove(index + 1))}
      >
        Next
        <ChevronRight aria-hidden="true" />
      </Button>
      <Button size="sm" onClick={() => guarded(() => onClose())}>
        Done
      </Button>
    </>
  );

  if (phone) {
    return (
      <PhoneSheet title={month.label} onClose={() => onClose()} footer={footer}>
        {fields}
      </PhoneSheet>
    );
  }

  return (
    <Popover
      anchor={anchor}
      onClose={(reason) => onClose(reason !== "outside")}
      labelledBy={titleId}
      className="w-64 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 id={titleId} className="text-sm font-semibold text-foreground">
          {month.label}
        </h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close" onClick={() => onClose()}>
          <X />
        </Button>
      </div>
      {fields}
      <div className="flex justify-between gap-1 pt-3">{footer}</div>
    </Popover>
  );
}

function PhoneSheet({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Modal onClose={onClose} title={title} module="lrp2027" footer={footer}>
      {children}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* View full table (collapsed by default)                              */
/* ------------------------------------------------------------------ */

function FullTable({
  open,
  onToggle,
  plan,
  totals,
  changedSet,
  disabled,
  onEdit,
  onValidity,
}: {
  open: boolean;
  onToggle: () => void;
  plan: CapacityPlan;
  totals: ReturnType<typeof capacityTotals>;
  changedSet: Set<string>;
  disabled: boolean;
  onEdit: (e: CapacityEdit) => void;
  onValidity: Validity;
}) {
  const id = useId();
  const pinned = "sticky left-0 z-10 w-20 max-sm:w-16 shadow-[1px_0_0_var(--border-strong)]";
  const th = "sticky top-0 z-20 h-9 whitespace-nowrap bg-surface-2 px-2 pb-2 align-bottom leading-none text-[11px] font-semibold uppercase tracking-[0.06em] text-muted";
  const totalCell = "sticky top-9 z-[15] border-b-2 border-border-strong bg-surface-3 text-right tabular-nums";

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="inline-flex h-10 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        View full table
      </button>
      <div id={id} hidden={!open}>
        {open && (
          <Card className="mt-2 overflow-hidden p-0 sm:p-0">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1 border-b border-border px-4 py-3">
              <div>
                <Label htmlFor={`${id}-year`} className="text-xs">
                  Plan year
                </Label>
                <DraftInput
                  id={`${id}-year`}
                  fieldKey="table:year"
                  kind="year"
                  value={plan.year}
                  changed={changedSet.has("year")}
                  disabled={disabled}
                  onCommit={(value) => onEdit({ kind: "year", value })}
                  onValidity={onValidity}
                  wrapperClassName="w-16"
                  className="max-sm:h-10"
                />
              </div>
              <p className="pb-2 text-[11px] text-muted">Relabels the plan only. Days are not recalculated.</p>
            </div>
            <div className="max-h-[calc(100dvh-13rem)] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-xs" aria-label={`Capacity plan ${plan.year}`}>
                <thead>
                  <tr>
                    <th scope="col" className={cn(th, pinned, "z-30 text-left")}>
                      Month
                    </th>
                    {MONTH_FIELDS.map((f) => (
                      <th key={f.key} scope="col" title={f.label} className={cn(th, "min-w-[4.5rem] text-right")}>
                        {f.short}
                      </th>
                    ))}
                    <th scope="col" title="Potential days" className={cn(th, "min-w-[4.5rem] text-right")}>
                      Potential
                    </th>
                    {HEADCOUNT_KEYS.map((key, i) => (
                      <th
                        key={key}
                        scope="col"
                        title={`${HEADCOUNT_LABELS[key]} mandays`}
                        className={cn(th, "min-w-[4.5rem] text-right", i === 0 && "border-l border-border")}
                      >
                        {key === "animUi" ? "Anim" : HEADCOUNT_SHORT_LABELS[key]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-semibold text-foreground">
                    <th
                      scope="row"
                      className={cn(CELL.base, pinned, "top-9 z-[16] border-b-2 border-border-strong bg-surface-3 text-left text-[11px] uppercase tracking-[0.06em]")}
                    >
                      Total
                    </th>
                    {[totals.workingDays, totals.holidays, totals.leaves, totals.potentialDays].map((v, i) => (
                      <td key={i} className={cn(CELL.base, totalCell)}>
                        {formatNumber(v)}
                      </td>
                    ))}
                    {HEADCOUNT_KEYS.map((key, i) => (
                      <td key={key} className={cn(CELL.base, totalCell, i === 0 && "border-l border-border")}>
                        {formatNumber(totals[key])}
                      </td>
                    ))}
                  </tr>
                  {plan.months.map((month, index) => {
                    const p = potentialDays(month);
                    const mandays = monthMandays(month, plan.headcount);
                    return (
                      <tr key={index}>
                        <th scope="row" className={cn(CELL.base, pinned, "border-t border-border bg-card text-left font-medium text-foreground")}>
                          {month.label}
                        </th>
                        {MONTH_FIELDS.map((f) => (
                          <td key={f.key} className="border-t border-border bg-card px-1 py-1">
                            <DraftInput
                              fieldKey={`table:month.${index}.${f.key}`}
                              aria-label={`${f.label}, ${month.label}`}
                              value={month[f.key]}
                              changed={changedSet.has(`month.${index}.${f.key}`)}
                              disabled={disabled}
                              onCommit={(value) => onEdit({ kind: "month", index, field: f.key, value })}
                              onValidity={onValidity}
                              wrapperClassName="ml-auto w-12 max-sm:w-14"
                              className="h-7 max-sm:h-10"
                            />
                          </td>
                        ))}
                        <td
                          title={p < 0 ? NEGATIVE_POTENTIAL : undefined}
                          className={cn(CELL.base, CELL.computed, "border-t border-border text-right", p < 0 && "font-semibold text-danger")}
                        >
                          {p < 0 && <AlertTriangle aria-hidden="true" className="mr-1 inline h-3 w-3" />}
                          {formatNumber(p)}
                        </td>
                        {HEADCOUNT_KEYS.map((key, i) => (
                          <td
                            key={key}
                            className={cn(CELL.base, CELL.computed, "border-t border-border text-right", i === 0 && "border-l")}
                          >
                            {formatNumber(mandays[key])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

function CapacitySkeleton() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Loading capacity plan...</span>
      <Skeleton className="h-8 w-56" />
      <Card className="space-y-2 p-4 sm:p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </Card>
      <Card className="grid grid-cols-6 gap-2 p-4 sm:grid-cols-12 sm:p-4">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-16 sm:h-24" />
        ))}
      </Card>
    </div>
  );
}
