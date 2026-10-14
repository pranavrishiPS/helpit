import { describe, expect, it } from "vitest";
import { addDays, format, getISOWeek } from "date-fns";
import {
  cellLines,
  groupDayLines,
  parseHeaderCell,
  parseReleaseCalendar,
  splitCellLines,
} from "@/lib/release-calendar-parse";

const TODAY = new Date(2026, 9, 14); // Wed, 14 Oct 2026

/** Sheet header labels ("Mon, October 12") for the Mon–Fri week starting on `monday`. */
function headerRow(weekLabel: string, monday: Date): string[] {
  return [weekLabel, ...[0, 1, 2, 3, 4].map((i) => format(addDays(monday, i), "EEE, MMMM d"))];
}

describe("parseHeaderCell", () => {
  it("matches 'Ddd, Month d' case-insensitively and trims", () => {
    expect(parseHeaderCell("  Wed, October 14 ")).toEqual({
      label: "Wed, October 14",
      weekday: 3,
      month: 9,
      day: 14,
    });
    expect(parseHeaderCell("mon, OCTOBER 12")?.month).toBe(9);
  });

  it("rejects other text", () => {
    expect(parseHeaderCell("Release 1.204")).toBeNull();
    expect(parseHeaderCell("Week 42")).toBeNull();
    expect(parseHeaderCell("Wed, October 32")).toBeNull();
    expect(parseHeaderCell("Wed October 14")).toBeNull();
  });
});

describe("splitCellLines", () => {
  it("splits on line breaks, trims and drops empty lines, keeping text verbatim", () => {
    expect(splitCellLines("  Release 1.204\r\n\n  hint UI fix  \n")).toEqual(["Release 1.204", "hint UI fix"]);
  });
});

describe("groupDayLines", () => {
  it("starts a group at each Release / iOS Release / Android Release line", () => {
    expect(
      groupDayLines([
        "Holiday",
        "Release 1.204",
        "Daily challenge",
        "Android 1.202 Catchup",
        "iOS Release 1.90",
        "Skipped build by devs, no release",
        "android release 1.206",
      ])
    ).toEqual([
      { items: ["Holiday"] },
      { heading: "Release 1.204", items: ["Daily challenge", "Android 1.202 Catchup"] },
      { heading: "iOS Release 1.90", items: ["Skipped build by devs, no release"] },
      { heading: "android release 1.206", items: [] },
    ]);
  });

  it("keeps lines like 'Released' or 'no release' as plain lines", () => {
    expect(groupDayLines(["Released to 10%", "Skipped build by devs, no release"])).toEqual([
      { items: ["Released to 10%", "Skipped build by devs, no release"] },
    ]);
  });
});

describe("cellLines (strikethrough)", () => {
  it("strikes every line of a cell struck as a whole", () => {
    expect(cellLines({ text: "Release 1.204\nP2E", strike: true })).toEqual([
      { text: "Release 1.204", struck: true },
      { text: "P2E", struck: true },
    ]);
    expect(cellLines("P2E")).toEqual([{ text: "P2E", struck: false }]);
  });

  it("strikes a line only when text runs strike all of it", () => {
    const text = "Release 1.204\nP2E\n cd_start_change ";
    const runs = [
      { start: 0, strike: true },
      { start: text.indexOf("P2E"), strike: false },
      { start: text.indexOf("cd_"), strike: true },
      { start: text.indexOf("start"), strike: false },
    ];
    expect(cellLines({ text, runs })).toEqual([
      { text: "Release 1.204", struck: true },
      { text: "P2E", struck: false },
      { text: "cd_start_change", struck: false },
    ]);
  });

  it("lets runs without a strike setting inherit the cell format", () => {
    expect(cellLines({ text: "a\nb", strike: true, runs: [{ start: 2 }] })).toEqual([
      { text: "a", struck: true },
      { text: "b", struck: true },
    ]);
  });
});

describe("struck lines in parsed days", () => {
  it("marks the struck Wed Oct 14 items and leaves Thu Oct 15 unstruck (sheet D773:D777 shape)", () => {
    const items = ["Release 1.204", "P2E", "cd_start_change", "dq_v3_opts", "dc_two_mistakes"];
    const rows = [
      headerRow("Week 42", new Date(2026, 9, 12)),
      ...items.map((text) => ["", "", "", { text, strike: true }, text]),
    ];
    const { weeks } = parseReleaseCalendar(rows, TODAY);
    const [, , wed, thu] = weeks[0].days;
    expect(wed.groups).toEqual([
      {
        heading: "Release 1.204",
        headingStruck: true,
        items: ["P2E", "cd_start_change", "dq_v3_opts", "dc_two_mistakes"],
        struckItems: [0, 1, 2, 3],
      },
    ]);
    // Unstruck days carry no flags, same shape as older snapshots.
    expect(thu.groups).toEqual([
      { heading: "Release 1.204", items: ["P2E", "cd_start_change", "dq_v3_opts", "dc_two_mistakes"] },
    ]);
  });
});

describe("parseReleaseCalendar", () => {
  it("resolves 'Wed, October 14' in Week 42 to 2026-10-14", () => {
    const rows = [
      headerRow("Week 42", new Date(2026, 9, 12)),
      ["", "", "", "Release 1.204\nDaily challenge", "", ""],
    ];
    const { weeks, warnings } = parseReleaseCalendar(rows, TODAY);

    expect(warnings).toEqual([]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekNumber).toBe(42);
    expect(weeks[0].days.map((d) => d.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(weeks[0].days[2]).toEqual({
      date: "2026-10-14",
      label: "Wed, October 14",
      groups: [{ heading: "Release 1.204", items: ["Daily challenge"] }],
    });
  });

  it("handles a blank column A on the first header, ignores rows before it, and keeps notes", () => {
    const rows = [
      ["Cryptogram release calendar", "Owner: Pranav"],
      [],
      headerRow("", new Date(2026, 9, 5)),
      ["LRP week", "Holiday", "", "", "", "Outing"],
      headerRow("Week 42", new Date(2026, 9, 12)),
    ];
    const { weeks } = parseReleaseCalendar(rows, TODAY);

    expect(weeks).toHaveLength(2);
    expect(weeks[0].label).toBe("");
    expect(weeks[0].weekNumber).toBeUndefined();
    expect(weeks[0].note).toBe("LRP week");
    expect(weeks[0].days[0].groups).toEqual([{ items: ["Holiday"] }]);
    expect(weeks[0].days[4].groups).toEqual([{ items: ["Outing"] }]);
    expect(weeks[1].note).toBeUndefined();
  });

  it("reads multi-line cells top to bottom across rows and groups them per day", () => {
    const rows = [
      headerRow("Week 42", new Date(2026, 9, 12)),
      ["", "Release 1.204\nDaily challenge\n\nHint revamp", "LRP Brainstorming"],
      ["", "Android 1.202 Catchup", "", "", "iOS Release 1.90"],
      ["", "", "", "", "Store listing"],
    ];
    const { weeks } = parseReleaseCalendar(rows, TODAY);
    const [mon, tue, , thu] = weeks[0].days;

    expect(mon.groups).toEqual([
      { heading: "Release 1.204", items: ["Daily challenge", "Hint revamp", "Android 1.202 Catchup"] },
    ]);
    expect(tue.groups).toEqual([{ items: ["LRP Brainstorming"] }]);
    expect(thu.groups).toEqual([{ heading: "iOS Release 1.90", items: ["Store listing"] }]);
    expect(weeks[0].days[2].groups).toEqual([]);
  });

  it("ignores columns that aren't day headers in that block", () => {
    const rows = [
      [...headerRow("Week 42", new Date(2026, 9, 12)), "Notes"],
      ["", "Release 1.204", "", "", "", "", "Ignore me"],
    ];
    const { weeks } = parseReleaseCalendar(rows, TODAY);
    expect(weeks[0].days).toHaveLength(5);
    expect(JSON.stringify(weeks)).not.toContain("Ignore me");
  });

  it("rolls over Week 52 / Week 53 / Week 1 into the next year, including inside a week", () => {
    const rows = [
      headerRow("Week 52", new Date(2026, 11, 21)),
      headerRow("Week 53", new Date(2026, 11, 28)), // Mon Dec 28 – Fri Jan 1
      headerRow("Week 1", new Date(2027, 0, 4)),
    ];
    const { weeks, warnings } = parseReleaseCalendar(rows, TODAY);

    expect(warnings).toEqual([]);
    expect(weeks[0].days[0].date).toBe("2026-12-21");
    expect(weeks[1].days.map((d) => d.date)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
    expect(weeks[2].days[0].date).toBe("2027-01-04");
    expect(weeks[2].weekNumber).toBe(1);
  });

  it("resolves the full history from Aug 2024 to Jan 2027", () => {
    const rows: string[][] = [];
    for (let monday = new Date(2024, 7, 5); monday <= new Date(2027, 0, 25); monday = addDays(monday, 7)) {
      rows.push(headerRow("", monday));
      rows.push(["", "Release x"]);
    }
    const { weeks, warnings } = parseReleaseCalendar(rows, TODAY);

    expect(warnings).toEqual([]);
    expect(weeks[0].days[0].date).toBe("2024-08-05");
    expect(weeks.at(-1)!.days[4].date).toBe("2027-01-29");
    const oct14 = weeks.flatMap((w) => w.days).find((d) => d.label === "Wed, October 14");
    expect(oct14?.date).toBe("2026-10-14");
  });

  it("handles Feb 29 in a leap year", () => {
    const rows = [headerRow("Week 9", new Date(2024, 1, 26))];
    const { weeks, warnings } = parseReleaseCalendar(rows, new Date(2024, 2, 1));
    expect(warnings).toEqual([]);
    expect(weeks[0].days[3]).toMatchObject({ label: "Thu, February 29", date: "2024-02-29" });
  });

  it("warns about a header whose weekday doesn't match, and still shows the block", () => {
    const rows = [
      headerRow("Week 41", new Date(2026, 9, 5)),
      ["Week 42", "Mon, October 12", "Tue, October 13", "Wed, October 15", "Thu, October 15", "Fri, October 16"],
      ["", "", "", "Outing"],
      headerRow("Week 43", new Date(2026, 9, 19)),
    ];
    const { weeks, warnings } = parseReleaseCalendar(rows, TODAY);

    expect(warnings).toEqual(["Week 42: 'Wed, October 15' does not match weekday"]);
    expect(weeks).toHaveLength(3);
    expect(weeks[1].days[0].date).toBe("2026-10-12");
    expect(weeks[1].days[2].groups).toEqual([{ items: ["Outing"] }]);
  });

  it("names a mismatched block by its row when column A is blank", () => {
    const rows = [["", "Mon, October 12", "Mon, October 13"]];
    const { weeks, warnings } = parseReleaseCalendar(rows, TODAY);
    expect(weeks[0].days[0].date).toBe("2026-10-12");
    expect(warnings).toEqual(["Row 1: 'Mon, October 13' does not match weekday"]);
  });

  describe("real Calendar tab shapes (fetched 2026-10-14)", () => {
    // Built from the observed sheet: weekly headers Aug 5 2024 → Jan 22 2027, col A " " on the
    // first row, ISO "Week N" labels, col G notes on some header rows, stacked groups in a column.
    const HEADER_NOTES: Record<string, string> = {
      "2025-12-29": "2026",
      "2026-02-02": "Feb, 26",
      "2026-04-27": "May,26",
      "2026-08-24": "Aryan, Sanyogita, Pratyush, Amit unavailable due to SIT",
      "2026-10-05": "Leave - Rohan",
      "2026-10-12": "Leave - Mangesh 14, 25, 16",
      "2026-10-19": "Leave - Mangesh, Pranav - full week\nAyush - 22, 23, 26\nSanyogita - 19,20",
    };
    // Extra rows under a week's header: [col B, C, D, E, F] per row.
    const BODY: Record<string, string[][]> = {
      // Week 29 2025, col D: two groups stacked.
      "2025-07-14": [
        ["", "", "iOS Release 1.26"],
        ["", "", "Android 1.88 Catchup"],
        ["", "", "Notif Permission "],
        ["", "", "Release 1.90"],
        ["", "", "Economy fixes - tentative"],
      ],
      // Week 30 2025, col D: no heading.
      "2025-07-21": [["", "", "Content Improvements (3-25) + God"]],
      // Week 47 2025, col C: blank cells between groups, double space in "iOS  Release".
      "2025-11-17": [
        ["", "Release 1.128"],
        ["", "midpuz"],
        ["", ""],
        ["", "Release 1.128 (OOCR)"],
        ["", " "],
        ["", "iOS  Release 1.40 (OOCR)"],
      ],
      // Week 42 2026: plain one-liners and whitespace-only cells.
      "2026-10-12": [
        ["HOLIDAY", "LRP Brainstorming ", " ", "Skipped build by devs, no release", "Outing"],
      ],
    };

    function realRows(): string[][] {
      const rows: string[][] = [];
      let first = true;
      for (let monday = new Date(2024, 7, 5); monday <= new Date(2027, 0, 18); monday = addDays(monday, 7)) {
        const key = format(monday, "yyyy-MM-dd");
        const header = headerRow(first ? " " : `Week ${getISOWeek(monday)}`, monday);
        if (HEADER_NOTES[key]) header.push(HEADER_NOTES[key]);
        rows.push(header);
        for (const body of BODY[key] ?? []) rows.push(["", ...body]);
        first = false;
      }
      return rows;
    }

    const parsed = parseReleaseCalendar(realRows(), TODAY);
    const week = (date: string) => parsed.weeks.find((w) => w.days[0].date === date)!;

    it("parses Aug 5 2024 → Jan 22 2027 with no year warnings", () => {
      expect(parsed.warnings).toEqual([]);
      expect(parsed.weeks[0].label).toBe("");
      expect(parsed.weeks[0].days[0]).toMatchObject({ label: "Mon, August 5", date: "2024-08-05" });
      expect(parsed.weeks.at(-1)!.days[4]).toMatchObject({ label: "Fri, January 22", date: "2027-01-22" });
      expect(parsed.weeks.at(-1)!.weekNumber).toBe(3);
    });

    it("maps Week 42 to 2026-10-12..16", () => {
      const w42 = week("2026-10-12");
      expect(w42.weekNumber).toBe(42);
      expect(w42.days.map((d) => d.date)).toEqual([
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
        "2026-10-15",
        "2026-10-16",
      ]);
    });

    it("resolves the 2024 Week 1 (Dec 30) and 2026 Week 53 rollovers", () => {
      const w1 = week("2024-12-30");
      expect(w1.weekNumber).toBe(1);
      expect(w1.days.map((d) => d.date)).toEqual([
        "2024-12-30",
        "2024-12-31",
        "2025-01-01",
        "2025-01-02",
        "2025-01-03",
      ]);
      const w53 = week("2026-12-28");
      expect(w53.weekNumber).toBe(53);
      expect(w53.days.at(-1)).toMatchObject({ label: "Fri, January 1", date: "2027-01-01" });
      expect(week("2027-01-04").weekNumber).toBe(1);
    });

    it("puts header-row notes before column A notes from rows below", () => {
      const { weeks } = parseReleaseCalendar(
        [[...headerRow("Week 41", new Date(2026, 9, 5)), "Leave - Rohan"], ["LRP week"]],
        TODAY
      );
      expect(weeks[0].note).toBe("Leave - Rohan\nLRP week");
    });

    it("keeps col G header-row notes (multi-line too) as week notes", () => {
      expect(week("2025-12-29").note).toBe("2026");
      expect(week("2026-02-02").note).toBe("Feb, 26");
      expect(week("2026-08-24").note).toBe("Aryan, Sanyogita, Pratyush, Amit unavailable due to SIT");
      expect(week("2026-10-19").note).toBe(
        "Leave - Mangesh, Pranav - full week\nAyush - 22, 23, 26\nSanyogita - 19,20"
      );
      expect(week("2026-10-12").note).toBe("Leave - Mangesh 14, 25, 16");
      // Notes never leak into day entries.
      expect(JSON.stringify(week("2026-10-12").days)).not.toContain("Leave - Mangesh");
    });

    it("stacks multiple groups in one column, in sheet order", () => {
      expect(week("2025-07-14").days[2].groups).toEqual([
        { heading: "iOS Release 1.26", items: ["Android 1.88 Catchup", "Notif Permission"] },
        { heading: "Release 1.90", items: ["Economy fixes - tentative"] },
      ]);
      expect(week("2025-07-21").days[2].groups).toEqual([
        { items: ["Content Improvements (3-25) + God"] },
      ]);
    });

    it("treats 'iOS  Release' (double space) as a heading and skips whitespace-only cells", () => {
      expect(week("2025-11-17").days[1].groups).toEqual([
        { heading: "Release 1.128", items: ["midpuz"] },
        { heading: "Release 1.128 (OOCR)", items: [] },
        { heading: "iOS  Release 1.40 (OOCR)", items: [] },
      ]);
    });

    it("keeps one-liners verbatim and ungrouped", () => {
      const days = week("2026-10-12").days;
      expect(days[0].groups).toEqual([{ items: ["HOLIDAY"] }]);
      expect(days[1].groups).toEqual([{ items: ["LRP Brainstorming"] }]);
      expect(days[2].groups).toEqual([]);
      expect(days[3].groups).toEqual([{ items: ["Skipped build by devs, no release"] }]);
      expect(days[4].groups).toEqual([{ items: ["Outing"] }]);
    });
  });

  it("returns no weeks when the tab has no header rows", () => {
    expect(parseReleaseCalendar([["Calendar"], ["", "Release 1.204"]], TODAY)).toEqual({
      weeks: [],
      warnings: [],
    });
  });
});
