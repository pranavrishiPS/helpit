import { describe, expect, it } from "vitest";
import { createNotifiedTracker, reminderKey } from "../use-task-reminder-notifications";

describe("reminderKey", () => {
  it("changes when the reminder is rescheduled", () => {
    const a = reminderKey({ id: "t1", reminderAt: "2026-10-03T09:00:00.000Z" });
    const b = reminderKey({ id: "t1", reminderAt: "2026-10-04T09:00:00.000Z" });
    expect(a).not.toBe(b);
  });
});

describe("createNotifiedTracker", () => {
  it("persists keys through storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const first = createNotifiedTracker(() => storage);
    first.add("t1|x");
    expect(createNotifiedTracker(() => storage).has("t1|x")).toBe(true);
    expect(first.has("t2|x")).toBe(false);
  });

  it("falls back to memory when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const tracker = createNotifiedTracker(() => storage);
    expect(() => tracker.add("t1|x")).not.toThrow();
    expect(tracker.has("t1|x")).toBe(true);
  });

  it("works with no storage at all", () => {
    const tracker = createNotifiedTracker(() => null);
    tracker.add("k");
    expect(tracker.has("k")).toBe(true);
  });
});
