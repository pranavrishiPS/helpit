import type { ScrumAttendanceEntry, ScrumStatus } from "./types";

function normaliseNote(note?: string): string {
  return note?.trim() ?? "";
}

/**
 * True when the attendance draft differs from the saved entries for a date.
 * Notes only count for "other" entries (they are dropped for every other status on save).
 */
export function isScrumDraftDirty(
  draft: Record<string, ScrumStatus>,
  draftNotes: Record<string, string>,
  entries: ScrumAttendanceEntry[]
): boolean {
  if (Object.keys(draft).length !== entries.length) return true;
  return entries.some((entry) => {
    if (draft[entry.member] !== entry.status) return true;
    if (entry.status !== "other") return false;
    return normaliseNote(draftNotes[entry.member]) !== normaliseNote(entry.note);
  });
}

/** Order-independent signature of the saved fields users can edit; for change detection. */
export function scrumEntriesSignature(entries: ScrumAttendanceEntry[]): string {
  return JSON.stringify(
    entries
      .map((e) => [e.member, e.status, normaliseNote(e.note)])
      .sort((a, b) => a[0].localeCompare(b[0]))
  );
}
