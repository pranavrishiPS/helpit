import { describe, expect, it } from "vitest";
import { isCommittableDate } from "../date-input";

describe("isCommittableDate", () => {
  it("accepts complete valid dates", () => {
    expect(isCommittableDate("2026-10-03")).toBe(true);
    expect(isCommittableDate("2028-02-29")).toBe(true);
  });

  it("rejects intermediate years from typing", () => {
    expect(isCommittableDate("0002-10-03")).toBe(false);
    expect(isCommittableDate("0202-10-03")).toBe(false);
    expect(isCommittableDate("1999-12-31")).toBe(false);
    expect(isCommittableDate("275760-09-13")).toBe(false);
    expect(isCommittableDate("2101-01-01")).toBe(false);
  });

  it("rejects empty, partial and impossible dates", () => {
    expect(isCommittableDate("")).toBe(false);
    expect(isCommittableDate("2026-10")).toBe(false);
    expect(isCommittableDate("2026-02-30")).toBe(false);
    expect(isCommittableDate("2026-13-01")).toBe(false);
  });
});
