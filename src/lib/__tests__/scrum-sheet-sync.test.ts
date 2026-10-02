import { describe, expect, it } from "vitest";
import {
  buildSheetRows,
  formatSheetDate,
  mergeScrumWithSheet,
  parseSheetDate,
  parseSheetRows,
  parseStatusLabel,
  removeDisallowedCells,
  removeHolidayCells,
} from "@/lib/scrum-sheet-sync";
import type { ScrumAttendanceEntry } from "@/lib/types";

function entry(overrides: Partial<ScrumAttendanceEntry> & { date: string; member: string }): ScrumAttendanceEntry {
  return {
    id: `${overrides.member}-${overrides.date}`,
    status: "on_time",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseStatusLabel", () => {
  it("parses known labels case-insensitively", () => {
    expect(parseStatusLabel("On time")).toBe("on_time");
    expect(parseStatusLabel("LATE")).toBe("late");
    expect(parseStatusLabel(" leave ")).toBe("leave");
    expect(parseStatusLabel("Other")).toBe("other");
  });

  it("parses the '1st half off' label and its aliases", () => {
    expect(parseStatusLabel("1st half off")).toBe("first_half_off");
    expect(parseStatusLabel("1st Half Off")).toBe("first_half_off");
    expect(parseStatusLabel("First half off")).toBe("first_half_off");
    expect(parseStatusLabel("Half day")).toBe("first_half_off");
  });

  it("maps the legacy SIT label to other", () => {
    expect(parseStatusLabel("SIT")).toBe("other");
  });

  it("returns undefined for blank or unrecognized text", () => {
    expect(parseStatusLabel("")).toBeUndefined();
    expect(parseStatusLabel(undefined)).toBeUndefined();
    expect(parseStatusLabel("Holiday")).toBeUndefined();
  });
});

describe("parseSheetDate / formatSheetDate", () => {
  it("parses the original sheet's d-MMM-yy format", () => {
    expect(parseSheetDate("30-Jul-26")).toBe("2026-07-30");
  });

  it("passes through an already-ISO date", () => {
    expect(parseSheetDate("2026-07-30")).toBe("2026-07-30");
  });

  it("round-trips ISO -> sheet format -> ISO", () => {
    const formatted = formatSheetDate("2026-07-30");
    expect(formatted).toBe("30-Jul-26");
    expect(parseSheetDate(formatted)).toBe("2026-07-30");
  });

  it("returns undefined for unparseable text", () => {
    expect(parseSheetDate("not a date")).toBeUndefined();
    expect(parseSheetDate("")).toBeUndefined();
  });
});

describe("parseSheetRows", () => {
  it("parses a wide grid into members, dates, and recognized cells", () => {
    const rows = [
      ["Member", "30-Jul-26", "31-Jul-26"],
      ["Pranav", "On time", "Late"],
      ["Vrushali", "", "Leave"],
    ];
    const parsed = parseSheetRows(rows);
    expect(parsed.members).toEqual(["Pranav", "Vrushali"]);
    expect(parsed.dates).toEqual(["2026-07-30", "2026-07-31"]);
    expect(parsed.cells).toContainEqual({ member: "Pranav", date: "2026-07-30", status: "on_time" });
    expect(parsed.cells).toContainEqual({ member: "Pranav", date: "2026-07-31", status: "late" });
    expect(parsed.cells).toContainEqual({ member: "Vrushali", date: "2026-07-31", status: "leave" });
    expect(parsed.cells).toHaveLength(3);
  });

  it("skips rows without a member name and columns without a parseable date", () => {
    const rows = [
      ["Member", "not a date", "31-Jul-26"],
      ["", "On time", "Late"],
      ["Pranav", "On time", "Late"],
    ];
    const parsed = parseSheetRows(rows);
    expect(parsed.members).toEqual(["Pranav"]);
    expect(parsed.dates).toEqual(["2026-07-31"]);
    expect(parsed.cells).toEqual([{ member: "Pranav", date: "2026-07-31", status: "late" }]);
  });

  it("skips a leading notes row (no dates) and finds the real header below it", () => {
    const rows = [
      [null, null, null, "All WFH"],
      ["Member", "30-Jul-26", "31-Jul-26", "13-Aug-26"],
      ["Pranav", "On time", "Late", "On time"],
    ] as unknown as string[][];
    const parsed = parseSheetRows(rows);
    expect(parsed.members).toEqual(["Pranav"]);
    expect(parsed.dates).toEqual(["2026-07-30", "2026-07-31", "2026-08-13"]);
    expect(parsed.cells).toHaveLength(3);
  });

  it("returns an empty result when no row has any parseable date", () => {
    const rows = [
      ["Member", "not a date"],
      ["Pranav", "On time"],
    ];
    expect(parseSheetRows(rows)).toEqual({ members: [], dates: [], cells: [] });
  });
});

describe("buildSheetRows", () => {
  it("builds a header + member rows, blank for missing entries, dates sorted ascending", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-07-31", status: "late" }),
      entry({ member: "Pranav", date: "2026-07-30", status: "on_time" }),
    ];
    const rows = buildSheetRows(["Pranav", "Vrushali"], ["2026-07-31", "2026-07-30"], entries);
    expect(rows[0]).toEqual(["Member", "30-Jul-26", "31-Jul-26"]);
    expect(rows[1]).toEqual(["Pranav", "On time", "Late"]);
    expect(rows[2]).toEqual(["Vrushali", "", ""]);
  });

  it("writes 'Holiday' for every member on a holiday date, even if an entry exists", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-07-30", status: "on_time" }),
      entry({ member: "Pranav", date: "2026-07-31", status: "late" }),
    ];
    const rows = buildSheetRows(
      ["Pranav", "Vrushali"],
      ["2026-07-30", "2026-07-31"],
      entries,
      new Set(["2026-07-30"])
    );
    expect(rows[1]).toEqual(["Pranav", "Holiday", "Late"]);
    expect(rows[2]).toEqual(["Vrushali", "Holiday", ""]);
  });

  it("does not read the 'Holiday' cell text back as a status", () => {
    const parsed = parseSheetRows([
      ["Member", "30-Jul-26"],
      ["Pranav", "Holiday"],
    ]);
    expect(parsed.cells).toEqual([]);
  });
});

describe("removeHolidayCells", () => {
  it("drops sheet cells on holiday dates and keeps the rest", () => {
    const sheet = {
      members: ["Pranav"],
      dates: ["2026-07-30", "2026-07-31"],
      cells: [
        { member: "Pranav", date: "2026-07-30", status: "on_time" as const },
        { member: "Pranav", date: "2026-07-31", status: "late" as const },
      ],
    };
    const result = removeHolidayCells(sheet, new Set(["2026-07-30"]));
    expect(result.cells).toEqual([{ member: "Pranav", date: "2026-07-31", status: "late" }]);
    expect(result.dates).toEqual(sheet.dates);
  });
});

describe("mergeScrumWithSheet", () => {
  it("lets the sheet win when both sides have a conflicting status for the same cell", () => {
    const appEntries = [entry({ member: "Pranav", date: "2026-08-01", status: "on_time" })];
    const sheet = { members: ["Pranav"], dates: ["2026-08-01"], cells: [{ member: "Pranav", date: "2026-08-01", status: "late" as const }] };

    const result = mergeScrumWithSheet(["Pranav"], appEntries, sheet);
    const merged = result.entries.find((e) => e.member === "Pranav" && e.date === "2026-08-01");
    expect(merged?.status).toBe("late");
    expect(result.changed).toBe(true);
  });

  it("preserves the app's note field when the sheet overwrites a status", () => {
    const appEntries = [
      entry({ member: "Pranav", date: "2026-08-01", status: "other", note: "Workshop" }),
    ];
    const sheet = { members: ["Pranav"], dates: ["2026-08-01"], cells: [{ member: "Pranav", date: "2026-08-01", status: "other" as const }] };

    const result = mergeScrumWithSheet(["Pranav"], appEntries, sheet);
    expect(result.entries[0].note).toBe("Workshop");
    expect(result.changed).toBe(false);
  });

  it("keeps app-only entries that the sheet doesn't have yet", () => {
    const appEntries = [entry({ member: "Pranav", date: "2026-09-18", status: "on_time" })];
    const sheet = { members: ["Pranav"], dates: [], cells: [] };

    const result = mergeScrumWithSheet(["Pranav"], appEntries, sheet);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].date).toBe("2026-09-18");
  });

  it("adopts new members found only in the sheet", () => {
    const sheet = {
      members: ["Pranav", "New Hire"],
      dates: ["2026-08-01"],
      cells: [{ member: "New Hire", date: "2026-08-01", status: "on_time" as const }],
    };

    const result = mergeScrumWithSheet(["Pranav"], [], sheet);
    expect(result.members).toEqual(["Pranav", "New Hire"]);
    expect(result.changed).toBe(true);
  });

  it("does not mark unchanged data as changed", () => {
    const appEntries = [entry({ member: "Pranav", date: "2026-08-01", status: "on_time" })];
    const sheet = {
      members: ["Pranav"],
      dates: ["2026-08-01"],
      cells: [{ member: "Pranav", date: "2026-08-01", status: "on_time" as const }],
    };

    const result = mergeScrumWithSheet(["Pranav"], appEntries, sheet);
    expect(result.changed).toBe(false);
    expect(result.entries[0]).toBe(appEntries[0]);
  });
});

describe("removeDisallowedCells", () => {
  it("drops '1st half off' cells before 2026-10-01 and keeps everything else", () => {
    const sheet = {
      members: ["Pranav"],
      dates: ["2026-09-30", "2026-10-01"],
      cells: [
        { member: "Pranav", date: "2026-09-30", status: "first_half_off" as const },
        { member: "Pranav", date: "2026-09-30", status: "late" as const },
        { member: "Pranav", date: "2026-10-01", status: "first_half_off" as const },
      ],
    };
    expect(removeDisallowedCells(sheet).cells).toEqual([
      { member: "Pranav", date: "2026-09-30", status: "late" },
      { member: "Pranav", date: "2026-10-01", status: "first_half_off" },
    ]);
  });
});
