"use client";

import { useEffect, useState } from "react";
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
  type EffortDraft,
} from "@/lib/effort-utils";
import { cn } from "@/lib/cn";

const effortInputClass =
  "w-full rounded border border-border bg-white px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums leading-tight outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

interface FunctionEffortGridProps {
  functionCosts?: ReleaseFunctionCost[];
  onSave?: (costs: ReleaseFunctionCost[]) => void;
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

  useEffect(() => {
    setEffortDrafts(buildEffortDrafts(functionCosts));
  }, [functionCosts]);

  function persistFunctionCosts(
    drafts: Record<ReleaseFunctionRole, EffortDraft>
  ): Record<ReleaseFunctionRole, EffortDraft> {
    const sanitized = sanitizeEffortDrafts(drafts);
    if (onSave) {
      const next = buildFunctionCostsFromDrafts(sanitized);
      if (!functionCostsEqual(functionCosts, next)) {
        onSave(next);
      }
    }
    return sanitized;
  }

  function handleEffortBlur(role: ReleaseFunctionRole, field: "est" | "act", value: string) {
    setEffortDrafts((prev) => {
      const merged = { ...prev, [role]: { ...prev[role], [field]: value } };
      return persistFunctionCosts(merged);
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
        <p className="text-[11px] font-medium text-foreground">Function effort</p>
        {hasAnyEffort ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            {hasEstimated && (
              <span>
                Est{" "}
                <span className="font-semibold text-foreground">{totalEstimated}d</span>
              </span>
            )}
            {hasEstimated && hasActual && <span className="text-muted/50">·</span>}
            {hasActual && (
              <span>
                Act <span className="font-semibold text-foreground">{totalActual}d</span>
              </span>
            )}
            {hasEstimated && hasActual && (
              <span
                className={cn(
                  "rounded px-1 py-px font-medium",
                  totalActual > totalEstimated && "bg-amber-100 text-amber-800",
                  totalActual < totalEstimated && "bg-emerald-100 text-emerald-800",
                  totalActual === totalEstimated && "bg-slate-100 text-muted"
                )}
              >
                {totalActual === totalEstimated
                  ? "On est"
                  : totalActual > totalEstimated
                    ? `+${totalActual - totalEstimated}d`
                    : `${totalActual - totalEstimated}d`}
              </span>
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
                "rounded-md border bg-white px-1.5 py-1",
                hasData ? "border-border" : "border-border/60"
              )}
            >
              <p
                className="truncate text-center text-[10px] font-medium uppercase tracking-wide text-muted"
                title={row.label}
              >
                {row.shortLabel}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1 text-center">
                <div>
                  <p className="text-[9px] font-medium uppercase tracking-wide text-muted/80">
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
                        hasEst ? "text-foreground" : "text-muted/40"
                      )}
                    />
                  ) : (
                    <p
                      className={cn(
                        "text-[11px] font-semibold tabular-nums leading-tight",
                        hasEst ? "text-foreground" : "text-muted/40"
                      )}
                    >
                      {formatEffortDays(row.estimatedDays)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-medium uppercase tracking-wide text-muted/80">
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
                        hasAct ? "text-accent" : "text-muted/40"
                      )}
                    />
                  ) : (
                    <p
                      className={cn(
                        "text-[11px] font-semibold tabular-nums leading-tight",
                        hasAct ? "text-accent" : "text-muted/40"
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
                    "mt-0.5 text-center text-[9px] font-medium tabular-nums",
                    variance > 0 ? "text-amber-700" : "text-emerald-700"
                  )}
                >
                  {variance > 0 ? `+${variance}d` : `${variance}d`}
                </p>
              )}
              {variance === 0 && (
                <p className="mt-0.5 text-center text-[9px] font-medium text-muted">On est</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
