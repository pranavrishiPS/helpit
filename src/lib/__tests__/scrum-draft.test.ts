import { describe, expect, it } from "vitest";
import { isScrumDraftDirty, scrumEntriesSignature } from "@/lib/scrum-draft";
import type { ScrumAttendanceEntry } from "@/lib/types";

function entry(
  member: string,
  status: ScrumAttendanceEntry["status"],
  note?: string
): ScrumAttendanceEntry {
  return {
    id: `${member}-2026-10-02`,
    date: "2026-10-02",
    member,
    status,
    note,
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
}

describe("isScrumDraftDirty", () => {
  const saved = [entry("Asha", "on_time"), entry("Ravi", "other", "Workshop")];

  it("is clean when the draft matches the saved entries", () => {
    expect(
      isScrumDraftDirty({ Asha: "on_time", Ravi: "other" }, { Ravi: "Workshop" }, saved)
    ).toBe(false);
  });

  it("is dirty when only the note of an 'other' entry changed", () => {
    expect(
      isScrumDraftDirty({ Asha: "on_time", Ravi: "other" }, { Ravi: "Offsite" }, saved)
    ).toBe(true);
  });

  it("ignores whitespace-only note differences", () => {
    expect(
      isScrumDraftDirty({ Asha: "on_time", Ravi: "other" }, { Ravi: " Workshop " }, saved)
    ).toBe(false);
  });

  it("ignores notes on non-'other' statuses", () => {
    expect(
      isScrumDraftDirty({ Asha: "on_time", Ravi: "other" }, { Asha: "stray", Ravi: "Workshop" }, saved)
    ).toBe(false);
  });

  it("is dirty when a status changed or a member was added", () => {
    expect(
      isScrumDraftDirty({ Asha: "late", Ravi: "other" }, { Ravi: "Workshop" }, saved)
    ).toBe(true);
    expect(
      isScrumDraftDirty(
        { Asha: "on_time", Ravi: "other", Mia: "leave" },
        { Ravi: "Workshop" },
        saved
      )
    ).toBe(true);
  });

  it("is clean for an empty draft and no entries", () => {
    expect(isScrumDraftDirty({}, {}, [])).toBe(false);
  });
});

describe("scrumEntriesSignature", () => {
  it("ignores order and timestamps but reflects status and note edits", () => {
    const a = [entry("Asha", "on_time"), entry("Ravi", "other", "Workshop")];
    const reordered = [{ ...a[1], updatedAt: "2026-10-03T00:00:00.000Z" }, a[0]];
    expect(scrumEntriesSignature(reordered)).toBe(scrumEntriesSignature(a));
    expect(scrumEntriesSignature([a[0], entry("Ravi", "other", "Offsite")])).not.toBe(
      scrumEntriesSignature(a)
    );
  });
});
