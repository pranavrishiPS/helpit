import { format } from "date-fns";
import type {
  ReleaseCalendarDay,
  ReleaseCalendarEntryGroup,
  ReleaseCalendarWeek,
} from "./types";

// Parses the WP sheet's "Calendar" tab into weeks (docs/specs/release-calendar-sheet.md §6).
// Pure: no I/O, no clock unless `now` is omitted.

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const MONTH_NAMES = [
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

/** Full month names, plus 3-letter and "Sept" forms so a header is never silently skipped. */
function monthIndex(name: string): number | undefined {
  const lower = name.toLowerCase();
  const full = MONTH_NAMES.indexOf(lower);
  if (full >= 0) return full;
  if (lower === "sept") return 8;
  const short = MONTH_NAMES.findIndex((m) => m.slice(0, 3) === lower);
  return short >= 0 ? short : undefined;
}

const HEADER_CELL = /^(mon|tue|wed|thu|fri|sat|sun),\s+([a-z]+)\s+(\d{1,2})$/i;
// Tolerates extra spaces ("iOS  Release 1.40 (OOCR)").
const RELEASE_HEADING = /^(?:(?:iOS|Android)\s+)?Release\b/i;
const WEEK_NUMBER = /Week\s*(\d+)/i;

interface HeaderCell {
  col: number;
  label: string;
  /** 0 = Sunday (Date#getDay). */
  weekday: number;
  month: number;
  day: number;
}

interface Block {
  /** 0-based sheet row of the header. */
  row: number;
  label: string;
  cells: HeaderCell[];
  notes: string[];
  /** Lines per header cell, top to bottom. */
  lines: string[][];
}

export interface ParsedReleaseCalendar {
  weeks: ReleaseCalendarWeek[];
  warnings: string[];
}

function cellText(row: unknown[] | undefined, col: number): string {
  const value = row?.[col];
  return value == null ? "" : String(value);
}

export function parseHeaderCell(text: string): Omit<HeaderCell, "col"> | null {
  const label = text.trim();
  const match = label.match(HEADER_CELL);
  if (!match) return null;
  const month = monthIndex(match[2]);
  const day = Number(match[3]);
  if (month === undefined || day < 1 || day > 31) return null;
  return { label, weekday: WEEKDAY_INDEX[match[1].toLowerCase()], month, day };
}

function headerCells(row: unknown[] | undefined): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const width = row?.length ?? 0;
  for (let col = 1; col < width; col++) {
    const parsed = parseHeaderCell(cellText(row, col));
    if (parsed) cells.push({ col, ...parsed });
  }
  return cells;
}

export function splitCellLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A "Release …" / "iOS Release …" / "Android Release …" line starts a group; other lines are its items. */
export function groupDayLines(lines: string[]): ReleaseCalendarEntryGroup[] {
  const groups: ReleaseCalendarEntryGroup[] = [];
  let current: ReleaseCalendarEntryGroup | undefined;
  for (const line of lines) {
    if (RELEASE_HEADING.test(line)) {
      current = { heading: line, items: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { items: [] };
        groups.push(current);
      }
      current.items.push(line);
    }
  }
  return groups;
}

function readBlocks(rows: unknown[][]): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;

  rows.forEach((row, rowIndex) => {
    const cells = headerCells(row);
    if (cells.length > 0) {
      // Non-date cells on the header row (e.g. col G "Leave - Rohan") are week notes, never dropped.
      const dateCols = new Set(cells.map((c) => c.col));
      const headerNotes: string[] = [];
      for (let col = 1; col < (row?.length ?? 0); col++) {
        if (!dateCols.has(col)) headerNotes.push(...splitCellLines(cellText(row, col)));
      }
      current = {
        row: rowIndex,
        label: cellText(row, 0).trim(),
        cells,
        notes: headerNotes,
        lines: cells.map(() => []),
      };
      blocks.push(current);
      return;
    }
    // Rows before the first header are ignored.
    if (!current) return;
    current.notes.push(...splitCellLines(cellText(row, 0)));
    current.cells.forEach((cell, i) => {
      current!.lines[i].push(...splitCellLines(cellText(row, cell.col)));
    });
  });

  return blocks;
}

/** Comparable day number for (year, month, day); not a real date, only ordered. */
function ordinal(year: number, month: number, day: number): number {
  return year * 400 + month * 32 + day;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}

interface YearAssignment {
  y0: number;
  /** Year of each header cell, per block. */
  years: number[][];
  /** Index of the first mismatched cell per block, or -1. */
  firstMismatch: number[];
  mismatches: number;
  first?: Date;
  last?: Date;
}

/**
 * Years increase monotonically from `y0`: a header whose first date is not later than the
 * previous header's moves to the next year. Within one header a later column that goes
 * back in the calendar (Dec 31 -> Jan 1) also moves to the next year.
 */
function assignYears(blocks: Block[], y0: number): YearAssignment {
  let year = y0;
  let previous: number | undefined;
  let mismatches = 0;
  const years: number[][] = [];
  const firstMismatch: number[] = [];
  let first: Date | undefined;
  let last: Date | undefined;

  for (const block of blocks) {
    const head = block.cells[0];
    let headOrdinal = ordinal(year, head.month, head.day);
    if (previous !== undefined && headOrdinal <= previous) {
      year += 1;
      headOrdinal = ordinal(year, head.month, head.day);
    }
    previous = headOrdinal;

    let cellYear = year;
    let prevCell = headOrdinal;
    const blockYears: number[] = [];
    let mismatchAt = -1;
    block.cells.forEach((cell, i) => {
      let o = ordinal(cellYear, cell.month, cell.day);
      if (i > 0 && o < prevCell) {
        cellYear += 1;
        o = ordinal(cellYear, cell.month, cell.day);
      }
      prevCell = o;
      blockYears.push(cellYear);
      const ok =
        isRealDate(cellYear, cell.month, cell.day) &&
        new Date(cellYear, cell.month, cell.day).getDay() === cell.weekday;
      if (!ok) {
        mismatches += 1;
        if (mismatchAt < 0) mismatchAt = i;
      }
      const date = new Date(cellYear, cell.month, cell.day);
      if (!first || date < first) first = date;
      if (!last || date > last) last = date;
    });
    years.push(blockYears);
    firstMismatch.push(mismatchAt);
  }

  return { y0, years, firstMismatch, mismatches, first, last };
}

/** Days between `today` and the [first, last] range; 0 when today is inside it. */
function distanceFromToday(a: YearAssignment, today: Date): number {
  if (!a.first || !a.last) return 0;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (t < a.first.getTime()) return a.first.getTime() - t;
  if (t > a.last.getTime()) return t - a.last.getTime();
  return 0;
}

function pickAssignment(blocks: Block[], today: Date): YearAssignment {
  const currentYear = today.getFullYear();
  const candidates: YearAssignment[] = [];
  for (let y0 = currentYear - 5; y0 <= currentYear + 1; y0++) {
    candidates.push(assignYears(blocks, y0));
  }
  // Fewest weekday mismatches first (ideally zero), then the range closest to today.
  candidates.sort(
    (a, b) =>
      a.mismatches - b.mismatches ||
      distanceFromToday(a, today) - distanceFromToday(b, today) ||
      Math.abs(a.y0 - currentYear) - Math.abs(b.y0 - currentYear)
  );
  return candidates[0];
}

export function parseReleaseCalendar(
  rows: unknown[][],
  now: Date = new Date()
): ParsedReleaseCalendar {
  const blocks = readBlocks(rows);
  if (blocks.length === 0) return { weeks: [], warnings: [] };

  const assignment = pickAssignment(blocks, now);
  const warnings: string[] = [];

  const weeks = blocks.map((block, b): ReleaseCalendarWeek => {
    const mismatchAt = assignment.firstMismatch[b];
    if (mismatchAt >= 0) {
      const name = block.label || `Row ${block.row + 1}`;
      warnings.push(`${name}: '${block.cells[mismatchAt].label}' does not match weekday`);
    }

    const days = block.cells.map(
      (cell, i): ReleaseCalendarDay => ({
        date: format(new Date(assignment.years[b][i], cell.month, cell.day), "yyyy-MM-dd"),
        label: cell.label,
        groups: groupDayLines(block.lines[i]),
      })
    );

    const weekNumber = block.label.match(WEEK_NUMBER);
    const week: ReleaseCalendarWeek = { label: block.label, days };
    if (weekNumber) week.weekNumber = Number(weekNumber[1]);
    if (block.notes.length > 0) week.note = block.notes.join("\n");
    return week;
  });

  return { weeks, warnings };
}
