/** Source of the Release Calendar mirror (docs/specs/release-calendar-sheet.md). Read-only. */
export const RELEASE_CALENDAR_SPREADSHEET_ID = "1r7M2HRio4Kg4dUIzPu_nkYqoO8N2rR5fqtnw8ehGQM8";
/** The "Calendar" tab, located by gid so a rename doesn't break the sync. */
export const RELEASE_CALENDAR_SHEET_GID = 1763731072;
export const RELEASE_CALENDAR_SHEET_NAME = "Cryptogram 6 WP";
export const RELEASE_CALENDAR_SHEET_URL = `https://docs.google.com/spreadsheets/d/${RELEASE_CALENDAR_SPREADSHEET_ID}/edit#gid=${RELEASE_CALENDAR_SHEET_GID}`;

/** A successful sync newer than this is reused instead of reading the sheet again. */
export const RELEASE_CALENDAR_THROTTLE_MS = 5 * 60 * 1000;
/** An attempt started less than this long ago (and not finished) counts as in flight. */
export const RELEASE_CALENDAR_IN_FLIGHT_MS = 60 * 1000;

export const RELEASE_CALENDAR_SHARE_PATH = "/share/release-calendar";
