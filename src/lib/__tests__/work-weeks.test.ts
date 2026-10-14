import { describe, expect, it } from "vitest";
import { buildWorkWeeks } from "@/lib/release-calendar";

describe("buildWorkWeeks", () => {
  it("returns Mon–Fri rows with week labels", () => {
    const weeks = buildWorkWeeks(new Date("2026-07-01"));
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks[0].days).toHaveLength(5);
    expect(weeks[0].weekLabel).toMatch(/^Week \d+$/);
  });
});
