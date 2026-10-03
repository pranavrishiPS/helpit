import { v4 as uuidv4 } from "uuid";
import { UserFacingError } from "./errors";
import { isStatusAllowedOnDate } from "./scrum-attendance";
import type { ScrumAttendanceEntry, ScrumStatus } from "./types";

/** Display label used in the connected Google Sheet's cells. */
export const SHEET_STATUS_LABELS: Record<ScrumStatus, string> = {
  on_time: "On time",
  late: "Late",
  leave: "Leave",
  first_half_off: "1st half off",
  other: "Other",
};

const LABEL_TO_STATUS: Record<string, ScrumStatus> = {
  "on time": "on_time",
  "on-time": "on_time",
  ontime: "on_time",
  late: "late",
  leave: "leave",
  "1st half off": "first_half_off",
  "first half off": "first_half_off",
  "1st half": "first_half_off",
  "half day": "first_half_off",
  other: "other",
  // legacy label from the original spreadsheet
  sit: "other",
};

/** Parses a status cell's text; returns undefined for blank/unrecognized cells (left untouched by sync). */
export function parseStatusLabel(raw: string | undefined | null): ScrumStatus | undefined {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return undefined;
  return LABEL_TO_STATUS[trimmed];
}

/** Collision-free key for a member+date pair (member names may contain any printable text). */
function cellKey(member: string, date: string): string {
  return JSON.stringify([member, date]);
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function toIsoIfValid(yyyy: number, month: number, day: number): string | undefined {
  const d = new Date(Date.UTC(yyyy, month - 1, day));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return undefined;
  }
  return `${String(yyyy).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses a header date cell into an ISO yyyy-MM-dd string. Strict on purpose: only
 * ISO "2026-07-30" and the "d-MMM-yy" / "dd-MMM-yyyy" style formatSheetDate emits are
 * accepted. Anything else ("Total 5", "Week 12", "Oct 1", "03/04/26") is rejected,
 * since loose Date parsing turns such headers into bogus dates and dd/mm vs mm/dd is ambiguous.
 */
export function parseSheetDate(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return toIsoIfValid(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = trimmed.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{2}|\d{4})$/);
  if (!dmy) return undefined;
  const name = dmy[2].toLowerCase();
  const monthIndex = MONTHS.findIndex((m) => m.startsWith(name));
  if (monthIndex === -1) return undefined;
  const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
  return toIsoIfValid(year, monthIndex + 1, Number(dmy[1]));
}

/** Formats an ISO date back into the sheet's "d-MMM-yy" display convention. */
export function formatSheetDate(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = String(yyyy).slice(-2);
  return `${day}-${month}-${year}`;
}

export interface ParsedSheetCell {
  member: string;
  date: string;
  status: ScrumStatus;
}

export interface ParsedSheet {
  members: string[];
  dates: string[];
  cells: ParsedSheetCell[];
  /** 0-based index of the header row within the rows that were parsed; unset when none was found. */
  headerRowIndex?: number;
}

/** Summary rows ("Total", "Average", ...) that sit under the member list aren't members. */
export function isSummaryRowName(name: string): boolean {
  return /^(total|totals|summary|count|average)\b/i.test(name.trim());
}

function isBlankRow(row: (string | null | undefined)[] | undefined): boolean {
  return !row || row.every((c) => !String(c ?? "").trim());
}

const MEMBER_HEADER_LABEL = /^(team\s+)?(members?|names?|developers?|persons?|people)\b/i;

/**
 * True when the sheet has a member list under a labelled header cell (A1 like "Member")
 * but no date columns yet. Sync may then add the first date column(s) to row 1 — only
 * empty cells are written, nothing existing is moved or overwritten.
 */
export function hasMemberHeaderWithoutDates(rows: (string | null | undefined)[][]): boolean {
  const first = rows[0] ?? [];
  if (!MEMBER_HEADER_LABEL.test(String(first[0] ?? "").trim())) return false;
  return !first.slice(1).some((c) => String(c ?? "").trim());
}

/**
 * Parses the wide grid. The header row (whichever one it is — a sheet may have
 * a leading notes row above it, as the original spreadsheet does) is the first
 * row with at least one parseable date after column A; every row before it is
 * ignored, and every row after it is read as a member until the first fully blank
 * row; summary rows ("Total", ...) are skipped.
 */
export function parseSheetRows(rows: string[][]): ParsedSheet {
  let headerRowIndex = -1;
  let dateColumns: { index: number; date: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const candidate = (rows[i] ?? [])
      .slice(1)
      .map((raw, j) => ({ index: j + 1, date: parseSheetDate(raw) }))
      .filter((c): c is { index: number; date: string } => !!c.date);
    if (candidate.length > 0) {
      headerRowIndex = i;
      dateColumns = candidate;
      break;
    }
  }

  let firstMemberRow = headerRowIndex + 1;
  if (headerRowIndex === -1) {
    // No dates yet: a labelled member column (row 1 header) still yields the roster.
    if (!hasMemberHeaderWithoutDates(rows)) return { members: [], dates: [], cells: [] };
    firstMemberRow = 1;
  }

  const members: string[] = [];
  const cells: ParsedSheetCell[] = [];

  for (const row of rows.slice(firstMemberRow)) {
    if (isBlankRow(row)) break; // the member list ends at the first fully blank row
    const member = row[0]?.trim();
    if (!member || isSummaryRowName(member)) continue;
    members.push(member);

    for (const { index, date } of dateColumns) {
      const status = parseStatusLabel(row[index]);
      if (status) cells.push({ member, date, status });
    }
  }

  return {
    members,
    dates: dateColumns.map((c) => c.date),
    cells,
    headerRowIndex: headerRowIndex === -1 ? undefined : headerRowIndex,
  };
}

/** Cell text written for a holiday date. Ignored when read back, so it never becomes a status. */
export const SHEET_HOLIDAY_LABEL = "Holiday";

/** Drops sheet cells that fall on a holiday — no attendance is tracked on those dates. */
export function removeHolidayCells(sheet: ParsedSheet, holidayDates: Set<string>): ParsedSheet {
  return { ...sheet, cells: sheet.cells.filter((c) => !holidayDates.has(c.date)) };
}

/** Drops sheet cells whose status isn't allowed on that date (e.g. "1st half off" before its start date). */
export function removeDisallowedCells(sheet: ParsedSheet): ParsedSheet {
  return { ...sheet, cells: sheet.cells.filter((c) => isStatusAllowedOnDate(c.status, c.date)) };
}

/** Builds the 2D grid to write back to the sheet from the merged app state. */
export function buildSheetRows(
  members: string[],
  dates: string[],
  entries: ScrumAttendanceEntry[],
  holidayDates: Set<string> = new Set()
): string[][] {
  const sortedDates = [...dates].sort();
  const byMemberDate = new Map(entries.map((e) => [cellKey(e.member, e.date), e]));

  const header = ["Member", ...sortedDates.map(formatSheetDate)];
  const body = members.map((member) => [
    member,
    ...sortedDates.map((date) => {
      if (holidayDates.has(date)) return SHEET_HOLIDAY_LABEL;
      const entry = byMemberDate.get(cellKey(member, date));
      return entry ? SHEET_STATUS_LABELS[entry.status] : "";
    }),
  ]);

  return [header, ...body];
}

export interface ScrumSheetMergeResult {
  members: string[];
  entries: ScrumAttendanceEntry[];
  changed: boolean;
}

/**
 * Merges a parsed sheet with the app's current state. The sheet wins on conflicts
 * (same member+date on both sides); the app's own note field is preserved; entries
 * that only exist app-side (not yet in the sheet) are kept so a later write-back adds them.
 */
export function mergeScrumWithSheet(
  appMembers: string[],
  appEntries: ScrumAttendanceEntry[],
  sheet: ParsedSheet
): ScrumSheetMergeResult {
  const now = new Date().toISOString();
  const appByKey = new Map(appEntries.map((e) => [cellKey(e.member, e.date), e]));
  const sheetKeys = new Set(sheet.cells.map((c) => cellKey(c.member, c.date)));

  let changed = false;
  const merged: ScrumAttendanceEntry[] = [];

  for (const cell of sheet.cells) {
    const key = cellKey(cell.member, cell.date);
    const existing = appByKey.get(key);
    if (existing && existing.status === cell.status) {
      merged.push(existing);
      continue;
    }
    changed = true;
    merged.push({
      id: existing?.id ?? uuidv4(),
      date: cell.date,
      member: cell.member,
      status: cell.status,
      note: existing?.note,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  for (const entry of appEntries) {
    const key = cellKey(entry.member, entry.date);
    if (!sheetKeys.has(key)) merged.push(entry);
  }

  const members = [...new Set([...appMembers, ...sheet.members])];
  if (members.length !== appMembers.length) changed = true;

  return { members, entries: merged, changed };
}

/** A contiguous block of cells to write, in A1 notation (relative to the sheet's first tab). */
export interface SheetRangeUpdate {
  range: string;
  values: string[][];
}

/** 0-based column index -> A1 column letters (0 -> "A", 26 -> "AA"). */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function cellText(rows: (string | null | undefined)[][], r: number, c: number): string {
  return String(rows[r]?.[c] ?? "");
}

/** True when sync owns the cell: blank, a recognized status, or our own holiday label. */
function isOwnedCellText(text: string): boolean {
  const t = text.trim();
  return !t || parseStatusLabel(t) !== undefined || t.toLowerCase() === SHEET_HOLIDAY_LABEL.toLowerCase();
}

/** Bounds of the range sync reads; writes outside it are refused (rows/cols are 1-based counts). */
export interface SheetLimits {
  maxRows: number;
  maxCols: number;
}

/**
 * Plans the minimal write-back for the merged app state: only cells sync owns are
 * touched, at their real positions. The original grid is never rewritten, so rows above
 * the header (notes), non-date columns ("Total", "Notes"), unrecognized cell text ("WFH")
 * and formulas stay as they are; new dates are appended as columns and new members as rows.
 * Returns no updates when the sheet already matches.
 */
export function planSheetWrite(
  rows: (string | null | undefined)[][],
  members: string[],
  dates: string[],
  entries: ScrumAttendanceEntry[],
  holidayDates: Set<string> = new Set(),
  limits?: SheetLimits
): SheetRangeUpdate[] {
  const parsed = parseSheetRows(rows as string[][]);
  const hasContent = rows.some((r) => (r ?? []).some((c) => String(c ?? "").trim()));

  // Locate (or decide where to create) the header row.
  let headerIdx: number;
  let freshHeader = false;
  if (parsed.headerRowIndex !== undefined) {
    headerIdx = parsed.headerRowIndex;
  } else if (!hasContent) {
    headerIdx = 0;
    freshHeader = true;
  } else if (rows.length === 1 && !(rows[0] ?? []).slice(1).some((c) => String(c ?? "").trim())) {
    headerIdx = 0; // a lone "Member" label row with no dates yet
  } else if (hasMemberHeaderWithoutDates(rows)) {
    headerIdx = 0; // labelled member column, no dates yet: the first date column goes in row 1
  } else {
    headerIdx = rows.length; // never overwrite unrelated content
    freshHeader = true;
  }

  const updates = new Map<string, string>(); // `${row}:${col}` -> value
  const set = (r: number, c: number, v: string) => updates.set(`${r}:${c}`, v);

  let width = 1;
  for (let r = headerIdx; r < rows.length; r++) width = Math.max(width, rows[r]?.length ?? 0);

  const dateColumns: { col: number; date: string }[] = [];
  if (!freshHeader) {
    for (let c = 1; c < (rows[headerIdx]?.length ?? 0); c++) {
      const d = parseSheetDate(cellText(rows, headerIdx, c));
      if (d) dateColumns.push({ col: c, date: d });
    }
  } else {
    set(headerIdx, 0, "Member");
  }

  const known = new Set(dateColumns.map((c) => c.date));
  for (const date of [...new Set(dates)].sort()) {
    if (known.has(date)) continue;
    set(headerIdx, width, formatSheetDate(date));
    dateColumns.push({ col: width, date });
    width += 1;
  }

  const byMemberDate = new Map(entries.map((e) => [cellKey(e.member, e.date), e]));
  const memberRows = new Map<string, number[]>();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const name = cellText(rows, r, 0).trim();
    if (!name || isSummaryRowName(name)) continue;
    memberRows.set(name, [...(memberRows.get(name) ?? []), r]);
  }

  let nextRow = Math.max(rows.length, headerIdx + 1);
  const targets: { member: string; row: number }[] = [];
  for (const member of members) {
    const existing = memberRows.get(member);
    if (existing) {
      for (const row of existing) targets.push({ member, row });
    } else {
      set(nextRow, 0, member);
      targets.push({ member, row: nextRow });
      nextRow += 1;
    }
  }

  for (const { member, row } of targets) {
    for (const { col, date } of dateColumns) {
      const current = cellText(rows, row, col);
      if (!isOwnedCellText(current)) continue; // preserve raw text we don't understand
      const entry = byMemberDate.get(cellKey(member, date));
      const desired = holidayDates.has(date)
        ? SHEET_HOLIDAY_LABEL
        : entry
          ? SHEET_STATUS_LABELS[entry.status]
          : "";
      if (desired !== current) set(row, col, desired);
    }
  }

  if (limits) {
    for (const key of updates.keys()) {
      const [r, c] = key.split(":").map(Number);
      if (r >= limits.maxRows || c >= limits.maxCols) {
        throw new UserFacingError(
          `The sheet is full — sync only reads and writes the first ${limits.maxRows} rows and ${limits.maxCols} columns, ` +
            "and there's no room to add more. Nothing was written to the sheet; archive old rows/columns and sync again."
        );
      }
    }
  }

  // Group into contiguous per-row ranges.
  const byRow = new Map<number, number[]>();
  for (const key of updates.keys()) {
    const [r, c] = key.split(":").map(Number);
    byRow.set(r, [...(byRow.get(r) ?? []), c]);
  }

  const result: SheetRangeUpdate[] = [];
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const cols = byRow.get(r)!.sort((a, b) => a - b);
    let start = cols[0];
    let prev = start;
    const flush = (end: number) => {
      const values = [Array.from({ length: end - start + 1 }, (_, i) => updates.get(`${r}:${start + i}`) ?? "")];
      const a = `${columnLetter(start)}${r + 1}`;
      result.push({ range: end === start ? a : `${a}:${columnLetter(end)}${r + 1}`, values });
    };
    for (const c of cols.slice(1)) {
      if (c !== prev + 1) {
        flush(prev);
        start = c;
      }
      prev = c;
    }
    flush(prev);
  }
  return result;
}

export interface ScrumSyncPlan {
  merged: ScrumSheetMergeResult;
  updates: SheetRangeUpdate[];
}

/**
 * The whole sync decision as a pure function of (fresh app state, sheet as read).
 * Called inside the store update so concurrent app edits are merged, not clobbered.
 */
export function planScrumSync(input: {
  members: string[];
  attendance: ScrumAttendanceEntry[];
  holidayDates: Set<string>;
  rows: (string | null | undefined)[][];
  limits?: SheetLimits;
}): ScrumSyncPlan {
  const { members, attendance, holidayDates, rows, limits } = input;
  const sheet = parseSheetRows(rows as string[][]);
  const merged = mergeScrumWithSheet(
    members,
    attendance.filter((e) => !holidayDates.has(e.date)),
    removeDisallowedCells(removeHolidayCells(sheet, holidayDates))
  );
  const updates = planSheetWrite(
    rows,
    merged.members,
    [...new Set([...sheet.dates, ...merged.entries.map((e) => e.date)])],
    merged.entries,
    holidayDates,
    limits
  );
  return { merged, updates };
}
