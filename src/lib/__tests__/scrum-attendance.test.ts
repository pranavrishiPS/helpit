import { describe, expect, it } from "vitest";
import {
  SCRUM_STATUSES,
  computeScrumInsights,
  statusesForDate,
  entriesByDateForMember,
  entriesForDate,
  entriesForMonth,
  holidayForDate,
  listAttendanceMonths,
  listScrumDates,
} from "@/lib/scrum-attendance";
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

describe("statusesForDate", () => {
  it("hides '1st half off' before 1 Oct 2026", () => {
    expect(statusesForDate("2026-09-30")).not.toContain("first_half_off");
  });

  it("offers '1st half off' from 1 Oct 2026", () => {
    expect(statusesForDate("2026-10-01")).toEqual(SCRUM_STATUSES);
  });

  it("keeps '1st half off' on an earlier date if an entry already uses it", () => {
    expect(statusesForDate("2026-09-30", "first_half_off")).toContain("first_half_off");
  });
});

describe("computeScrumInsights", () => {
  it("computes per-member counts and on-time rate", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01", status: "on_time" }),
      entry({ member: "Pranav", date: "2026-08-02", status: "late" }),
      entry({ member: "Pranav", date: "2026-08-03", status: "on_time" }),
      entry({ member: "Vrushali", date: "2026-08-01", status: "leave" }),
    ];

    const insights = computeScrumInsights(["Pranav", "Vrushali"], entries);
    const pranav = insights.find((i) => i.member === "Pranav")!;
    const vrushali = insights.find((i) => i.member === "Vrushali")!;

    expect(pranav.onTime).toBe(2);
    expect(pranav.late).toBe(1);
    expect(pranav.totalDays).toBe(3);
    expect(pranav.onTimeRate).toBe(67);

    expect(vrushali.leave).toBe(1);
    expect(vrushali.totalDays).toBe(1);
    expect(vrushali.attendedDays).toBe(0);
    expect(vrushali.onTimeRate).toBeNull();
  });

  it("returns a null on-time rate for a member on leave every tracked day", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01", status: "leave" }),
      entry({ member: "Pranav", date: "2026-08-02", status: "leave" }),
    ];
    const [pranav] = computeScrumInsights(["Pranav"], entries);
    expect(pranav.totalDays).toBe(2);
    expect(pranav.attendedDays).toBe(0);
    expect(pranav.onTimeRate).toBeNull();
  });

  it("computes the rate out of attended days only in a mixed month", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01", status: "on_time" }),
      entry({ member: "Pranav", date: "2026-08-02", status: "late" }),
      entry({ member: "Pranav", date: "2026-08-03", status: "leave" }),
    ];
    const [pranav] = computeScrumInsights(["Pranav"], entries);
    expect(pranav.totalDays).toBe(3);
    expect(pranav.attendedDays).toBe(2);
    expect(pranav.onTimeRate).toBe(50);
  });

  it("excludes 'leave' status entries from the on-time rate", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01", status: "on_time" }),
      entry({ member: "Pranav", date: "2026-08-02", status: "leave" }),
    ];
    const insights = computeScrumInsights(["Pranav"], entries);
    expect(insights[0].onTimeRate).toBe(100);
  });

  it("excludes 'other' status entries from the on-time rate", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01", status: "on_time" }),
      entry({ member: "Pranav", date: "2026-08-02", status: "other", note: "Workshop" }),
    ];
    const insights = computeScrumInsights(["Pranav"], entries);
    expect(insights[0].onTimeRate).toBe(100);
  });

  it("counts '1st half off' in total days but excludes it from the on-time rate", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-10-01", status: "on_time" }),
      entry({ member: "Pranav", date: "2026-10-02", status: "first_half_off" }),
    ];
    const [pranav] = computeScrumInsights(["Pranav"], entries);
    expect(pranav.firstHalfOff).toBe(1);
    expect(pranav.totalDays).toBe(2);
    expect(pranav.attendedDays).toBe(1);
    expect(pranav.onTimeRate).toBe(100);
  });

  it("includes roster members with zero logged days", () => {
    const insights = computeScrumInsights(["Aryan"], []);
    expect(insights).toEqual([
      {
        member: "Aryan",
        onTime: 0,
        late: 0,
        leave: 0,
        firstHalfOff: 0,
        totalDays: 0,
        attendedDays: 0,
        onTimeRate: null,
      },
    ]);
  });

  it("includes members with entries even if no longer on the roster", () => {
    const entries = [entry({ member: "Former Member", date: "2026-08-01" })];
    const insights = computeScrumInsights([], entries);
    expect(insights.map((i) => i.member)).toEqual(["Former Member"]);
  });
});

describe("listScrumDates", () => {
  it("returns distinct dates sorted most-recent-first", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01" }),
      entry({ member: "Vrushali", date: "2026-08-01" }),
      entry({ member: "Pranav", date: "2026-08-03" }),
    ];
    expect(listScrumDates(entries)).toEqual(["2026-08-03", "2026-08-01"]);
  });
});

describe("entriesForDate", () => {
  it("filters entries to the given date", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01" }),
      entry({ member: "Pranav", date: "2026-08-02" }),
    ];
    expect(entriesForDate(entries, "2026-08-01")).toHaveLength(1);
  });
});

describe("entriesForMonth", () => {
  it("filters entries to the given month", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01" }),
      entry({ member: "Pranav", date: "2026-08-31" }),
      entry({ member: "Pranav", date: "2026-09-01" }),
    ];
    expect(entriesForMonth(entries, "2026-08")).toHaveLength(2);
    expect(entriesForMonth(entries, "2026-09")).toHaveLength(1);
  });
});

describe("listAttendanceMonths", () => {
  it("returns distinct months sorted most-recent-first", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01" }),
      entry({ member: "Vrushali", date: "2026-09-05" }),
      entry({ member: "Pranav", date: "2026-08-20" }),
    ];
    expect(listAttendanceMonths(entries)).toEqual(["2026-09", "2026-08"]);
  });
});

describe("entriesByDateForMember", () => {
  it("maps a single member's entries by date, ignoring other members", () => {
    const entries = [
      entry({ member: "Pranav", date: "2026-08-01", status: "late" }),
      entry({ member: "Vrushali", date: "2026-08-01", status: "leave" }),
    ];
    const byDate = entriesByDateForMember(entries, "Pranav");
    expect(byDate.size).toBe(1);
    expect(byDate.get("2026-08-01")?.status).toBe("late");
  });
});

describe("holidayForDate", () => {
  it("finds a holiday matching the given date", () => {
    const holidays = [{ date: "2026-09-14", label: "Holiday" }];
    expect(holidayForDate(holidays, "2026-09-14")).toEqual({
      date: "2026-09-14",
      label: "Holiday",
    });
  });

  it("returns undefined when the date has no holiday", () => {
    const holidays = [{ date: "2026-09-14" }];
    expect(holidayForDate(holidays, "2026-09-15")).toBeUndefined();
  });
});
