"use client";

import { useEffect, useRef, useState } from "react";
import type { ReleaseFunctionCost, ReleaseFunctionRole } from "@/lib/types";
import {
  RELEASE_FUNCTION_LABELS,
  RELEASE_FUNCTION_SHORT_LABELS,
  RELEASE_FUNCTION_ORDER,
} from "@/lib/release-constants";
import {
  buildEffortDrafts,
  buildFunctionCostsFromDrafts,
  effortVariance,
  formatEffortDays,
  functionCostsEqual,
  parseOptionalDays,
  sanitizeEffortDrafts,
} from "@/lib/effort-utils";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";

const effortInputClass =
  "w-full rounded-md border border-transparent bg-surface-2 px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums leading-tight outline-none transition-colors placeholder:text-subtle hover:border-input focus:border-signal focus:bg-card focus:ring-2 focus:ring-signal/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

interface FunctionEffortGridProps {
  functionCosts?: ReleaseFunctionCost[];
  /** Resolve to false when the save failed so the draft is reverted. */
  onSave?: (costs: ReleaseFunctionCost[]) => void | boolean | Promise<void | boolean>;
  readOnly?: boolean;
  compact?: boolean;
  idPrefix: string;
}

export function FunctionEffortGrid({
  functionCosts,
  onSave,
  readOnly = false,
  compact = false,
  idPrefix,
}: FunctionEffortGridProps) {
  const editable = !!onSave && !readOnly;
  const [effortDrafts, setEffortDrafts] = useState(() => buildEffortDrafts(functionCosts));

  // Re-seed from the store only if the user has no unsaved edits: a reload (poller,
  // another mutation) must not wipe a half-typed value.
  const seededCostsRef = useRef(functionCosts);
  useEffect(() => {
    const seededDrafts = buildEffortDrafts(seededCostsRef.current);
    seededCostsRef.current = functionCosts;
    setEffortDrafts((prev) =>
      JSON.stringify(sanitizeEffortDrafts(prev)) === JSON.stringify(seededDrafts)
        ? buildEffortDrafts(functionCosts)
        : prev
    );
  }, [functionCosts]);

  const latestCostsRef = useRef(functionCosts);
  useEffect(() => {
    latestCostsRef.current = functionCosts;
  }, [functionCosts]);

  function handleEffortBlur(role: ReleaseFunctionRole, field: "est" | "act", value: string) {
    // Compute from current state (not inside a state updater, which StrictMode double-invokes)
    // so the network save happens exactly once.
    const merged = { ...effortDrafts, [role]: { ...effortDrafts[role], [field]: value } };
    const sanitized = sanitizeEffortDrafts(merged);
    setEffortDrafts(sanitized);
    if (!onSave) return;
    const next = buildFunctionCostsFromDrafts(sanitized);
    if (functionCostsEqual(functionCosts, next)) return;
    void Promise.resolve(onSave(next)).then((ok) => {
      // A failed save reverts the draft to the stored value.
      if (ok === false) setEffortDrafts(buildEffortDrafts(latestCostsRef.current));
    });
  }

  const functionRows = RELEASE_FUNCTION_ORDER.map((role) => {
    const draft = effortDrafts[role];
    const estimatedDays = editable ? parseOptionalDays(draft.est) : undefined;
    const actualDays = editable ? parseOptionalDays(draft.act) : undefined;
    const row = functionCosts?.find((f) => f.role === role);
    return {
      role,
      label: RELEASE_FUNCTION_LABELS[role],
      shortLabel: RELEASE_FUNCTION_SHORT_LABELS[role],
      involved: editable
        ? estimatedDays != null || actualDays != null
        : (row?.involved ?? false),
      estimatedDays: editable ? estimatedDays : row?.effortDays,
      actualDays: editable ? actualDays : row?.actualEffortDays,
    };
  });

  const totalEstimated = functionRows.reduce(
    (sum, row) => sum + (row.involved && row.estimatedDays != null ? row.estimatedDays : 0),
    0
  );
  const totalActual = functionRows.reduce(
    (sum, row) => sum + (row.involved && row.actualDays != null ? row.actualDays : 0),
    0
  );
  const hasEstimated = functionRows.some((row) => row.involved && row.estimatedDays != null);
  const hasActual = functionRows.some((row) => row.involved && row.actualDays != null);
  const hasAnyEffort = hasEstimated || hasActual;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Function effort</p>
        {hasAnyEffort ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            {hasEstimated && (
              <span>
                Est{" "}
                <span className="font-semibold text-foreground">{totalEstimated}d</span>
              </span>
            )}
            {hasEstimated && hasActual && <span aria-hidden="true" className="text-subtle">·</span>}
            {hasActual && (
              <span>
                Act <span className="font-semibold text-foreground">{totalActual}d</span>
              </span>
            )}
            {hasEstimated && hasActual && (
              <Badge
                tone={
                  totalActual > totalEstimated
                    ? "caution"
                    : totalActual < totalEstimated
                      ? "success"
                      : "neutral"
                }
                className="tabular-nums"
              >
                {totalActual === totalEstimated
                  ? "On est"
                  : totalActual > totalEstimated
                    ? `+${totalActual - totalEstimated}d`
                    : `${totalActual - totalEstimated}d`}
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted">Not added yet</p>
        )}
      </div>

      <div className={cn("grid grid-cols-3 gap-1", !compact && "gap-1.5 sm:grid-cols-4")}>
        {functionRows.map((row) => {
          const hasEst = row.involved && row.estimatedDays != null;
          const hasAct = row.involved && row.actualDays != null;
          const variance = effortVariance(row.estimatedDays, row.actualDays);
          const hasData = hasEst || hasAct;

          return (
            <div
              key={row.role}
              className={cn(
                "rounded-lg border bg-card px-1.5 py-1.5",
                hasData ? "border-border" : "border-dashed border-border-strong"
              )}
            >
              <p
                className="truncate text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-muted"
                title={row.label}
              >
                {row.shortLabel}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1 text-center">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                    Est
                  </p>
                  {editable ? (
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={effortDrafts[row.role].est}
                      onChange={(e) =>
                        setEffortDrafts((prev) => ({
                          ...prev,
                          [row.role]: { ...prev[row.role], est: e.target.value },
                        }))
                      }
                      onBlur={(e) => handleEffortBlur(row.role, "est", e.target.value)}
                      placeholder="—"
                      aria-label={`${row.label} estimated effort`}
                      id={`${idPrefix}-${row.role}-est`}
                      className={cn(
                        effortInputClass,
                        hasEst ? "text-foreground" : "text-subtle"
                      )}
                    />
                  ) : (
                    <p
                      className={cn(
                        "text-[11px] font-semibold tabular-nums leading-tight",
                        hasEst ? "text-foreground" : "text-subtle"
                      )}
                    >
                      {formatEffortDays(row.estimatedDays)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                    Act
                  </p>
                  {editable ? (
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={effortDrafts[row.role].act}
                      onChange={(e) =>
                        setEffortDrafts((prev) => ({
                          ...prev,
                          [row.role]: { ...prev[row.role], act: e.target.value },
                        }))
                      }
                      onBlur={(e) => handleEffortBlur(row.role, "act", e.target.value)}
                      placeholder="—"
                      aria-label={`${row.label} actual effort`}
                      id={`${idPrefix}-${row.role}-act`}
                      className={cn(
                        effortInputClass,
                        hasAct ? "text-accent" : "text-subtle"
                      )}
                    />
                  ) : (
                    <p
                      className={cn(
                        "text-[11px] font-semibold tabular-nums leading-tight",
                        hasAct ? "text-accent" : "text-subtle"
                      )}
                    >
                      {formatEffortDays(row.actualDays)}
                    </p>
                  )}
                </div>
              </div>
              {variance != null && variance !== 0 && (
                <p
                  className={cn(
                    "mt-0.5 text-center text-[10px] font-semibold tabular-nums",
                    variance > 0 ? "text-caution" : "text-success"
                  )}
                >
                  {variance > 0 ? `+${variance}d` : `${variance}d`}
                </p>
              )}
              {variance === 0 && (
                <p className="mt-0.5 text-center text-[10px] font-medium text-muted">On est</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
