import { readJsonText, withJsonLock, writeJsonText } from "./json-persist";
import type { ReleaseCalendarSnapshot } from "./types";

// Cached Release Calendar snapshot. Its own file (not store.json) so share responses never
// touch the main store (docs/specs/release-calendar-sheet.md §7).

const SNAPSHOT_FILE = "release-calendar.json";

function isSnapshot(value: unknown): value is ReleaseCalendarSnapshot {
  const v = value as Partial<ReleaseCalendarSnapshot> | null;
  return !!v && typeof v === "object" && Array.isArray(v.weeks) && Array.isArray(v.warnings);
}

/**
 * The last snapshot, or null when none exists. A real read failure throws (callers must not
 * treat it as "no snapshot"); an unparseable file is a regenerable cache and reads as null.
 */
export async function readReleaseCalendarSnapshot(): Promise<ReleaseCalendarSnapshot | null> {
  return withJsonLock(SNAPSHOT_FILE, async () => {
    const raw = await readJsonText(SNAPSHOT_FILE);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed : null;
    } catch (err) {
      console.error(
        "[release-calendar] release-calendar.json is unreadable; it will be replaced by the next sync:",
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  });
}

export async function writeReleaseCalendarSnapshot(snapshot: ReleaseCalendarSnapshot): Promise<void> {
  await withJsonLock(SNAPSHOT_FILE, async () => {
    await writeJsonText(SNAPSHOT_FILE, JSON.stringify(snapshot));
  });
}
