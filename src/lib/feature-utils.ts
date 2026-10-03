import { format, parseISO, subDays, startOfDay, isBefore, isToday } from "date-fns";
import type { Feature } from "./types";

/** Days before pre-production closure when internal spec review should be done. */
export const SPEC_REVIEW_LEAD_DAYS = 2;

export function getSpecReviewDueDate(preProductionClosureDate?: string): string | undefined {
  if (!preProductionClosureDate) return undefined;
  return format(subDays(parseISO(preProductionClosureDate), SPEC_REVIEW_LEAD_DAYS), "yyyy-MM-dd");
}

export function formatFeatureDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  return format(parseISO(dateStr), "EEE, d MMM yyyy");
}

export function isDatePast(dateStr?: string): boolean {
  if (!dateStr) return false;
  const date = startOfDay(parseISO(dateStr));
  return isBefore(date, startOfDay(new Date())) && !isToday(parseISO(dateStr));
}

/** Scope is closed once explicitly marked done. */
export function isScopeClosed(feature: Pick<Feature, "scopeClosureCompletedAt">): boolean {
  return !!feature.scopeClosureCompletedAt;
}

export function isSpecReviewOverdue(feature: Feature): boolean {
  if (feature.specReviewCompletedAt) return false;
  const due = getSpecReviewDueDate(feature.preProductionClosureDate);
  return isDatePast(due);
}

/**
 * Dated features first by date, undated last. Ties (same date, or both undated) fall back
 * to title A-Z then id, so the order is deterministic regardless of input order.
 */
export function sortFeatures(features: Feature[]): Feature[] {
  const dateOf = (f: Feature) =>
    f.releaseDate || f.startDate || f.scopeClosureDate || f.preProductionClosureDate || "";
  return [...features].sort((a, b) => {
    const aDate = dateOf(a);
    const bDate = dateOf(b);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    if (aDate && bDate && aDate !== bDate) return aDate < bDate ? -1 : 1;
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
