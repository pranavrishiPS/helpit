const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * True only for a complete, real yyyy-MM-dd date in a sensible year range.
 * Chrome's date input emits intermediate values while typing (e.g. year 0002),
 * which must never be saved.
 */
export function isCommittableDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
