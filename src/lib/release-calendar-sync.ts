import { google } from "googleapis";
import { UserFacingError, publicErrorMessage } from "./errors";
import {
  RELEASE_CALENDAR_IN_FLIGHT_MS,
  RELEASE_CALENDAR_SHEET_GID,
  RELEASE_CALENDAR_SHEET_NAME,
  RELEASE_CALENDAR_SPREADSHEET_ID,
  RELEASE_CALENDAR_THROTTLE_MS,
} from "./release-calendar-config";
import { parseReleaseCalendar } from "./release-calendar-parse";
import { readReleaseCalendarSnapshot, writeReleaseCalendarSnapshot } from "./release-calendar-store";
import { getAuthorizedClient } from "./scrum-sheet";
import { readScrumSheetTokens } from "./scrum-sheet-store";
import type { ReleaseCalendarSnapshot } from "./types";

// Read-only sync of the WP sheet's Calendar tab (docs/specs/release-calendar-sheet.md §7).
// Only spreadsheets.get and values.get are called; nothing here ever writes to the sheet.
// Tokens stay on the server: nothing returned from here contains them.

export type SyncSkipReason = "fresh" | "in_flight" | "recent_attempt";

export interface ReleaseCalendarSyncResult {
  snapshot: ReleaseCalendarSnapshot | null;
  /** True when this call read the sheet successfully. */
  synced: boolean;
  skipped?: SyncSkipReason;
  notConnected?: boolean;
  /** Safe, user-facing message (never contains the connected email or token details). */
  error?: string;
}

function ageMs(iso: string | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : nowMs - t;
}

/**
 * Whether to skip reading the sheet. In flight = an attempt started < 60s ago that hasn't
 * finished (no newer success, no error). Unforced calls also reuse a success < 5 min old and
 * back off for 60s after a failed attempt. `force` (owner Sync now) only respects in flight.
 */
export function syncSkipReason(
  snapshot: ReleaseCalendarSnapshot | null,
  { force, nowMs }: { force: boolean; nowMs: number }
): SyncSkipReason | null {
  if (!snapshot) return null;
  const attemptAge = ageMs(snapshot.lastAttemptAt, nowMs);
  const attemptFinished =
    !!snapshot.lastError ||
    (!!snapshot.syncedAt &&
      !!snapshot.lastAttemptAt &&
      Date.parse(snapshot.syncedAt) >= Date.parse(snapshot.lastAttemptAt));
  if (attemptAge < RELEASE_CALENDAR_IN_FLIGHT_MS && !attemptFinished) return "in_flight";
  if (force) return null;
  if (ageMs(snapshot.syncedAt, nowMs) < RELEASE_CALENDAR_THROTTLE_MS) return "fresh";
  if (attemptAge < RELEASE_CALENDAR_IN_FLIGHT_MS) return "recent_attempt";
  return null;
}

function httpStatusOf(err: unknown): number | undefined {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null;
  for (const value of [e?.response?.status, e?.status, e?.code]) {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Safe message for a failed sync. Logs only the error name/message, never request config or tokens. */
export function describeSyncError(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  const status = httpStatusOf(err);
  if (status === 403 || status === 404) {
    return `The connected Google account can't open ${RELEASE_CALENDAR_SHEET_NAME}. Ask the sheet owner for view access.`;
  }
  const message = err instanceof Error ? err.message : "";
  if (/invalid_grant/i.test(message)) {
    return "Google Sheets access expired. Reconnect Google Sheets.";
  }
  return publicErrorMessage(err, "Couldn't sync the release calendar. Try again.", "Release calendar sync");
}

function emptySnapshot(): ReleaseCalendarSnapshot {
  return {
    spreadsheetId: RELEASE_CALENDAR_SPREADSHEET_ID,
    sheetGid: RELEASE_CALENDAR_SHEET_GID,
    sheetTitle: "",
    weeks: [],
    warnings: [],
  };
}

async function readCalendarRows(): Promise<{ title: string; rows: unknown[][] }> {
  const client = await getAuthorizedClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: RELEASE_CALENDAR_SPREADSHEET_ID,
    fields: "sheets.properties",
  });
  const tab = meta.data.sheets?.find((s) => s.properties?.sheetId === RELEASE_CALENDAR_SHEET_GID);
  const title = tab?.properties?.title;
  if (!title) throw new UserFacingError(`Calendar tab not found in ${RELEASE_CALENDAR_SHEET_NAME}.`);

  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: RELEASE_CALENDAR_SPREADSHEET_ID,
    range: `'${title.replace(/'/g, "''")}'!A:Z`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return { title, rows: (read.data.values ?? []) as unknown[][] };
}

async function runSync(current: ReleaseCalendarSnapshot | null): Promise<ReleaseCalendarSyncResult> {
  const tokens = await readScrumSheetTokens();
  if (!tokens) return { snapshot: current, synced: false, notConnected: true };

  const base = current ?? emptySnapshot();
  const startedAt = new Date().toISOString();
  // Mark the attempt so other instances see it in flight.
  await writeReleaseCalendarSnapshot({ ...base, lastAttemptAt: startedAt, lastError: undefined });

  try {
    const { title, rows } = await readCalendarRows();
    const parsed = parseReleaseCalendar(rows);
    if (parsed.weeks.length === 0 && base.weeks.length > 0) {
      throw new UserFacingError("Calendar tab returned no weeks");
    }
    const next: ReleaseCalendarSnapshot = {
      spreadsheetId: RELEASE_CALENDAR_SPREADSHEET_ID,
      sheetGid: RELEASE_CALENDAR_SHEET_GID,
      sheetTitle: title,
      syncedAt: new Date().toISOString(),
      lastAttemptAt: startedAt,
      weeks: parsed.weeks,
      warnings: parsed.warnings,
    };
    await writeReleaseCalendarSnapshot(next);
    return { snapshot: next, synced: true };
  } catch (err) {
    const message = describeSyncError(err);
    // Keep the previous weeks and syncedAt; only record the failure.
    const next: ReleaseCalendarSnapshot = { ...base, lastAttemptAt: startedAt, lastError: message };
    try {
      await writeReleaseCalendarSnapshot(next);
    } catch (writeErr) {
      console.error(
        "[release-calendar] failed to record sync error:",
        writeErr instanceof Error ? writeErr.message : String(writeErr)
      );
    }
    return { snapshot: next, synced: false, error: message };
  }
}

let inFlight: Promise<ReleaseCalendarSyncResult> | null = null;

/** Throttled sync; never throws for sheet/auth failures (they come back as `error`). */
export async function syncReleaseCalendar(
  { force = false }: { force?: boolean } = {}
): Promise<ReleaseCalendarSyncResult> {
  if (inFlight) return inFlight;

  const current = await readReleaseCalendarSnapshot();
  const skipped = syncSkipReason(current, { force, nowMs: Date.now() });
  if (skipped) return { snapshot: current, synced: false, skipped, error: current?.lastError };
  // Another call may have started while we were reading.
  if (inFlight) return inFlight;

  inFlight = runSync(current).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function isReleaseCalendarConnected(): Promise<{ connected: boolean }> {
  const tokens = await readScrumSheetTokens();
  return { connected: !!tokens };
}
