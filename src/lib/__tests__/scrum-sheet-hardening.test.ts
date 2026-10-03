import { describe, expect, it } from "vitest";
import { planScrumSync, planSheetWrite, parseSheetRows } from "@/lib/scrum-sheet-sync";
import { UserFacingError } from "@/lib/errors";

describe("parseSheetRows summary rows", () => {
  const rows = [
    ["Member", "1-Oct-26"],
    ["Asha", "On time"],
    ["Ravi", "Late"],
    ["Total", "2"],
    ["Average", "1"],
  ];

  it("ignores Total/Average rows", () => {
    expect(parseSheetRows(rows).members).toEqual(["Asha", "Ravi"]);
  });

  it("stops at the first fully blank row", () => {
    const parsed = parseSheetRows([
      ["Member", "1-Oct-26"],
      ["Asha", "On time"],
      ["", ""],
      ["Notes row below the table", "x"],
    ]);
    expect(parsed.members).toEqual(["Asha"]);
  });

  it("does not add a Total row to the roster on sync", () => {
    const plan = planScrumSync({ members: [], attendance: [], holidayDates: new Set(), rows });
    expect(plan.merged.members).toEqual(["Asha", "Ravi"]);
  });
});

describe("planSheetWrite limits", () => {
  const limits = { maxRows: 5, maxCols: 4 };

  it("refuses to append a member row beyond the read range", () => {
    const rows = [["Member"], ["A"], ["B"], ["C"], ["D"]]; // 5 rows == maxRows
    expect(() =>
      planSheetWrite(rows, ["A", "B", "C", "D", "New"], [], [], new Set(), limits)
    ).toThrow(UserFacingError);
  });

  it("refuses to add a date column beyond the read range", () => {
    const rows = [["Member", "1-Oct-26", "2-Oct-26", "3-Oct-26"], ["A"]];
    expect(() => planSheetWrite(rows, ["A"], ["2026-10-04"], [], new Set(), limits)).toThrow(
      /sheet is full/
    );
  });

  it("writes normally within the limits", () => {
    const rows = [["Member", "1-Oct-26"], ["A"]];
    const updates = planSheetWrite(rows, ["A", "B"], [], [], new Set(), limits);
    expect(updates).toEqual([{ range: "A3", values: [["B"]] }]);
  });
});

describe("member column without date columns", () => {
  const rows = [["Member"], ["Asha"], ["Ravi"]];

  it("reads the roster from the sheet", () => {
    expect(parseSheetRows(rows).members).toEqual(["Asha", "Ravi"]);
  });

  it("adds the first date column to row 1 without touching member rows", () => {
    const updates = planSheetWrite(
      rows,
      ["Asha", "Ravi"],
      ["2026-10-01"],
      [
        {
          id: "1",
          member: "Asha",
          date: "2026-10-01",
          status: "late",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ]
    );
    expect(updates).toContainEqual({ range: "B1", values: [["1-Oct-26"]] });
    expect(updates).toContainEqual({ range: "B2", values: [["Late"]] });
    expect(updates.every((u) => !u.range.startsWith("A"))).toBe(true);
  });

  it("does not treat unrelated first-row content as a header", () => {
    const notes = [["Some notes"], ["Asha"]];
    const updates = planSheetWrite(notes, ["Asha"], ["2026-10-01"], []);
    // the new header goes below existing content, never into row 1
    expect(updates.every((u) => !/^[A-Z]+1(:|$)/.test(u.range))).toBe(true);
  });
});
