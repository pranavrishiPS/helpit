/**
 * Outing pool math. The pool is a fixed team pool (team size x per-person), unless an
 * explicit total is sent without a per-person amount — then the total wins as-is.
 */
export function resolveOutingBudget(
  budget: number | undefined,
  budgetPerPerson: number | undefined | null,
  rosterSize: number
): { totalBudget: number; perPerson?: number } | null {
  let totalBudget = budget;
  let perPerson = budgetPerPerson ?? undefined;

  if (perPerson != null && rosterSize > 0) {
    // Pool is funded for the whole team, including members who don't go
    totalBudget = Math.round(perPerson * rosterSize);
  } else if (totalBudget != null && perPerson == null && rosterSize > 0) {
    // Only keep a derived per-person when it is exact; a rounded value would shrink the
    // pool on the next team edit (10000 / 3 -> 3333 -> 9999).
    const exact = totalBudget / rosterSize;
    if (Number.isInteger(exact)) perPerson = exact;
  }

  if (totalBudget == null) return null;
  return { totalBudget, perPerson };
}

/**
 * Per-person input for a PATCH: `null` clears it; an explicit `budget` without
 * `budgetPerPerson` drops the stored per-person so the new total wins; otherwise keep it.
 */
export function patchPerPersonInput(
  budget: number | undefined | null,
  budgetPerPerson: number | undefined | null,
  currentPerPerson: number | undefined
): number | undefined {
  if (budgetPerPerson === null) return undefined;
  if (budgetPerPerson !== undefined) return budgetPerPerson;
  if (budget != null) return undefined;
  return currentPerPerson;
}
