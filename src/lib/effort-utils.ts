import type { ReleaseFunctionCost, ReleaseFunctionRole } from "@/lib/types";
import { RELEASE_FUNCTION_ORDER } from "@/lib/release-constants";

export type EffortDraft = { est: string; act: string };

export function formatEffortDays(days?: number): string {
  return days != null ? `${days}d` : "—";
}

export function effortVariance(est?: number, act?: number): number | null {
  if (est == null || act == null) return null;
  return act - est;
}

export function parseOptionalDays(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function buildEffortDrafts(
  costs?: ReleaseFunctionCost[]
): Record<ReleaseFunctionRole, EffortDraft> {
  return Object.fromEntries(
    RELEASE_FUNCTION_ORDER.map((role) => {
      const row = costs?.find((f) => f.role === role);
      return [
        role,
        {
          est: row?.effortDays != null ? String(row.effortDays) : "",
          act: row?.actualEffortDays != null ? String(row.actualEffortDays) : "",
        },
      ];
    })
  ) as Record<ReleaseFunctionRole, EffortDraft>;
}

export function buildFunctionCostsFromDrafts(
  drafts: Record<ReleaseFunctionRole, EffortDraft>
): ReleaseFunctionCost[] {
  return RELEASE_FUNCTION_ORDER.flatMap((role) => {
    const est = parseOptionalDays(drafts[role].est);
    const act = parseOptionalDays(drafts[role].act);
    if (est == null && act == null) return [];
    return [{ role, involved: true, effortDays: est, actualEffortDays: act }];
  });
}

export function sanitizeEffortDrafts(
  drafts: Record<ReleaseFunctionRole, EffortDraft>
): Record<ReleaseFunctionRole, EffortDraft> {
  return Object.fromEntries(
    RELEASE_FUNCTION_ORDER.map((role) => {
      const est = parseOptionalDays(drafts[role].est);
      const act = parseOptionalDays(drafts[role].act);
      return [
        role,
        {
          est: est != null ? String(est) : "",
          act: act != null ? String(act) : "",
        },
      ];
    })
  ) as Record<ReleaseFunctionRole, EffortDraft>;
}

export function functionCostsEqual(
  a?: ReleaseFunctionCost[],
  b?: ReleaseFunctionCost[]
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

export function normalizeFunctionCosts(
  costs?: ReleaseFunctionCost[]
): ReleaseFunctionCost[] | undefined {
  if (!costs?.length) return undefined;
  const filtered = costs.filter(
    (c) => c.involved && (c.effortDays != null || c.actualEffortDays != null)
  );
  return filtered.length > 0 ? filtered : undefined;
}

export function sumEffortDays(
  costs: ReleaseFunctionCost[] | undefined,
  field: "effortDays" | "actualEffortDays"
): number {
  if (!costs?.length) return 0;
  return costs.reduce(
    (sum, row) => sum + (row.involved && row[field] != null ? row[field]! : 0),
    0
  );
}
