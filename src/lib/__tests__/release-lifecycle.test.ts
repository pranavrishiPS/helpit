import { describe, expect, it } from "vitest";
import { applyReleasePatch } from "@/lib/release-lifecycle";
import type { Release } from "@/lib/types";

function release(
  id: string,
  overrides: Partial<Release> = {}
): Release {
  return {
    id,
    name: id,
    status: "in_dev",
    blockers: [],
    createdAt: "2026-07-08T12:00:00.000Z",
    updatedAt: "2026-07-08T12:00:00.000Z",
    ...overrides,
  };
}

describe("applyReleasePatch", () => {
  it("updates only the patched release", () => {
    const base = [
      release("rel-android-1180", { phase: "ux", targetDate: "2026-07-13" }),
      release("rel-ios-176", { targetDate: "2026-07-15" }),
    ];

    const next = applyReleasePatch(
      base,
      "rel-android-1180",
      { phase: "dev" },
      "2026-07-10T08:00:00.000Z"
    );

    expect(next.find((r) => r.id === "rel-android-1180")?.phase).toBe("dev");
    expect(next.find((r) => r.id === "rel-ios-176")?.targetDate).toBe("2026-07-15");
  });

  it("marks a release as shipped", () => {
    const base = [
      release("rel-android-1180", { targetDate: "2026-07-13" }),
      release("rel-ios-176", { targetDate: "2026-07-15" }),
    ];

    const next = applyReleasePatch(
      base,
      "rel-android-1180",
      { status: "live", actualDate: "2026-07-13" },
      "2026-07-13T10:00:00.000Z"
    );

    expect(next.find((r) => r.id === "rel-android-1180")?.status).toBe("live");
  });

  it("blocks moving a completed release back to in-flight", () => {
    const base = [
      release("rel-android-1180", {
        status: "live",
        actualDate: "2026-07-13",
      }),
    ];

    expect(() =>
      applyReleasePatch(
        base,
        "rel-android-1180",
        { status: "in_dev" },
        "2026-07-14T10:00:00.000Z"
      )
    ).toThrow("RELEASE_COMPLETED");
  });
});

describe("date patch preservation", () => {
  it("preserves the other date when only one is patched", () => {
    const base = [
      {
        id: "rel-android-1180",
        name: "Android 1.180",
        status: "in_dev" as const,
        targetDate: "2026-07-13",
        actualDate: "2026-07-08",
        blockers: [],
        createdAt: "2026-07-08T12:00:00.000Z",
        updatedAt: "2026-07-08T12:00:00.000Z",
      },
    ];

    const next = applyReleasePatch(
      base,
      "rel-android-1180",
      { actualDate: "2026-07-10" },
      "2026-07-10T08:00:00.000Z"
    );

    expect(next[0]?.targetDate).toBe("2026-07-13");
    expect(next[0]?.actualDate).toBe("2026-07-10");
  });
});
