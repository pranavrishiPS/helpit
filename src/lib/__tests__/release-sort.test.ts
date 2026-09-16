import { describe, expect, it } from "vitest";
import { partitionReleases, sortUpcomingReleases } from "@/lib/release-sort";
import type { Release } from "@/lib/types";

function release(id: string, targetDate?: string, overrides: Partial<Release> = {}): Release {
  return {
    id,
    name: id,
    status: "in_dev",
    blockers: [],
    targetDate,
    createdAt: "2026-07-08T12:00:00.000Z",
    updatedAt: "2026-07-08T12:00:00.000Z",
    ...overrides,
  };
}

describe("sortUpcomingReleases", () => {
  it("sorts dated releases ascending and puts undated releases last", () => {
    const sorted = sortUpcomingReleases([
      release("undated"),
      release("late", "2026-07-21"),
      release("early", "2026-07-13"),
    ]);

    expect(sorted.map((r) => r.id)).toEqual(["early", "late", "undated"]);
  });
});

describe("partitionReleases", () => {
  it("puts the nearest dated release in active", () => {
    const { active, upcoming } = partitionReleases([
      release("later", "2026-07-22"),
      release("earlier", "2026-07-13"),
      release("middle", "2026-07-21"),
    ]);

    expect(active?.id).toBe("earlier");
    expect(upcoming.map((r) => r.id)).toEqual(["middle", "later"]);
  });

  it("puts undated releases in upcoming after dated ones", () => {
    const { active, upcoming } = partitionReleases([
      release("undated"),
      release("dated", "2026-07-15"),
    ]);

    expect(active?.id).toBe("dated");
    expect(upcoming.map((r) => r.id)).toEqual(["undated"]);
  });
});
