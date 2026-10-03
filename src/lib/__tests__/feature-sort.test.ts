import { describe, expect, it } from "vitest";
import { sortFeatures } from "@/lib/feature-utils";
import type { Feature } from "@/lib/types";

const f = (id: string, title: string, extra: Partial<Feature> = {}) =>
  ({ id, title, ...extra }) as Feature;

describe("sortFeatures", () => {
  it("puts undated features last, in A-Z title order", () => {
    const sorted = sortFeatures([
      f("1", "Zebra"),
      f("2", "Alpha"),
      f("3", "Dated late", { releaseDate: "2026-12-01" }),
      f("4", "Dated early", { startDate: "2026-10-01" }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["4", "3", "2", "1"]);
  });

  it("is deterministic regardless of input order", () => {
    const items = [
      f("a", "Same", { releaseDate: "2026-11-01" }),
      f("b", "Same", { releaseDate: "2026-11-01" }),
      f("c", "Same"),
      f("d", "Same"),
    ];
    const forward = sortFeatures(items).map((x) => x.id);
    const reversed = sortFeatures([...items].reverse()).map((x) => x.id);
    expect(forward).toEqual(["a", "b", "c", "d"]);
    expect(reversed).toEqual(forward);
  });
});
