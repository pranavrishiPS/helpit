import { describe, expect, it } from "vitest";
import {
  dayHasEntries,
  layoutWeek,
  listSnapshotMonths,
  pickInitialMonth,
  upcomingReleases,
  weeksInMonth,
} from "@/lib/release-calendar-view";
import type { ReleaseCalendarDay, ReleaseCalendarWeek } from "@/lib/types";

function day(date: string, label: string, groups: ReleaseCalendarDay["groups"] = []): ReleaseCalendarDay {
  return { date, label, groups };
}

const weeks: ReleaseCalendarWeek[] = [
  {
    label: "Week 40",
    weekNumber: 40,
    days: [
      day("2026-09-28", "Mon, September 28", [{ heading: "Release 1.202", items: ["Old"] }]),
      day("2026-10-02", "Fri, October 2"),
    ],
  },
  {
    label: "Week 42",
    weekNumber: 42,
    days: [
      day("2026-10-12", "Mon, October 12", [{ heading: "Release 1.204", items: ["A", "B"] }]),
      day("2026-10-14", "Wed, October 14", [
        { items: ["Holiday"] },
        { heading: "iOS Release 1.90", items: [] },
      ]),
      day("2026-10-16", "Fri, October 16", [{ heading: "Release 1.206", items: ["C"] }]),
    ],
  },
];

describe("release calendar view helpers", () => {
  it("lists snapshot months and weeks touching a month", () => {
    expect(listSnapshotMonths(weeks)).toEqual(["2026-09", "2026-10"]);
    expect(weeksInMonth(weeks, "2026-09")).toHaveLength(1);
    expect(weeksInMonth(weeks, "2026-10")).toHaveLength(2);
  });

  it("opens on today's month, else the nearest snapshot month", () => {
    const months = ["2026-08", "2026-10"];
    expect(pickInitialMonth(months, "2026-10-14")).toBe("2026-10");
    expect(pickInitialMonth(months, "2026-09-10")).toBe("2026-08");
    expect(pickInitialMonth(months, "2026-01-01")).toBe("2026-08");
    expect(pickInitialMonth([], "2026-10-14")).toBeUndefined();
  });

  it("slots days by the sheet weekday and never drops extra columns", () => {
    const week: ReleaseCalendarWeek = {
      label: "",
      days: [
        day("2026-10-12", "Mon, October 12"),
        day("2026-10-14", "Wed, October 14"),
        day("2026-10-17", "Sat, October 17", [{ items: ["Offsite"] }]),
      ],
    };
    const { slots, extras } = layoutWeek(week);
    expect(slots.map((d) => d?.date)).toEqual(["2026-10-12", undefined, "2026-10-14", undefined, undefined]);
    expect(extras.map((d) => d.label)).toEqual(["Sat, October 17"]);
    expect(dayHasEntries(extras[0])).toBe(true);
    expect(dayHasEntries(slots[0])).toBe(false);
  });

  it("lists the next release headings from today, in date then sheet order", () => {
    expect(upcomingReleases(weeks, "2026-10-14")).toEqual([
      { date: "2026-10-14", heading: "iOS Release 1.90", items: [] },
      { date: "2026-10-16", heading: "Release 1.206", items: ["C"] },
    ]);
    expect(upcomingReleases(weeks, "2026-09-01", 2).map((r) => r.heading)).toEqual([
      "Release 1.202",
      "Release 1.204",
    ]);
  });
});
