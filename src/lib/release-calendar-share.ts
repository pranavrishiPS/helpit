import { timingSafeEqualStrings } from "./auth";
import { RELEASE_CALENDAR_SHARE_PATH } from "./release-calendar-config";

// Public read-only share link (docs/specs/release-calendar-sheet.md §9). The token lives only in
// the RELEASE_CALENDAR_SHARE_TOKEN env var; nothing is stored or generated in the app.

export const MIN_SHARE_TOKEN_LENGTH = 32;

type Env = Record<string, string | undefined>;

/** The configured token, or null when sharing is off (unset or shorter than 32 characters). */
export function getReleaseCalendarShareToken(env: Env = process.env): string | null {
  const token = env.RELEASE_CALENDAR_SHARE_TOKEN?.trim();
  return token && token.length >= MIN_SHARE_TOKEN_LENGTH ? token : null;
}

/** Constant-time check of a share URL token. False whenever sharing is off. */
export async function isValidReleaseCalendarShareToken(
  provided: string | undefined | null,
  env: Env = process.env
): Promise<boolean> {
  const expected = getReleaseCalendarShareToken(env);
  if (!expected || !provided) return false;
  return timingSafeEqualStrings(provided, expected);
}

/** Path of the share page (no origin), or null when sharing is off. Only for signed-in users. */
export function getReleaseCalendarSharePath(env: Env = process.env): string | null {
  const token = getReleaseCalendarShareToken(env);
  return token ? `${RELEASE_CALENDAR_SHARE_PATH}/${encodeURIComponent(token)}` : null;
}
