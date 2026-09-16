import { describe, expect, it } from "vitest";
import {
  buildWorkWeeks,
  getReleaseCalendarDate,
  groupReleasesByCalendarDate,
  getUndatedReleases,
} from "@/lib/release-calendar";
import type { Release } from "@/lib/types";

function release(overrides: Partial<Release> & Pick<Release, "id" | "name">): Release {
  return {
    status: "in_dev",
    blockers: [],
    createdAt: "2026-07-08T12:00:00.000Z",
    updatedAt: "2026-07-08T12:00:00.000Z",
    ...overrides,
  };
}

describe("getReleaseCalendarDate", () => {
  it("uses target date for in-flight releases", () => {
    expect(
      getReleaseCalendarDate(
        release({ id: "1", name: "A", targetDate: "2026-07-13" })
      )
    ).toBe("2026-07-13");
  });

  it("uses actual date for live releases when set", () => {
    expect(
      getReleaseCalendarDate(
        release({
          id: "1",
          name: "A",
          status: "live",
          targetDate: "2026-07-13",
          actualDate: "2026-07-08",
        })
      )
    ).toBe("2026-07-08");
  });
});

describe("groupReleasesByCalendarDate", () => {
  it("groups releases by calendar date", () => {
    const map = groupReleasesByCalendarDate([
      release({ id: "a", name: "Android 1.182", targetDate: "2026-07-13" }),
      release({ id: "b", name: "iOS 1.76", targetDate: "2026-07-13" }),
      release({ id: "c", name: "Undated" }),
    ]);

    expect(map.get("2026-07-13")?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(getUndatedReleases([release({ id: "c", name: "Undated" })])).toHaveLength(1);
  });
});

describe("buildWorkWeeks", () => {
  it("returns Mon–Fri rows with week labels", () => {
    const weeks = buildWorkWeeks(new Date("2026-07-01"));
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks[0].days).toHaveLength(5);
    expect(weeks[0].weekLabel).toMatch(/^Week \d+$/);
  });
});
