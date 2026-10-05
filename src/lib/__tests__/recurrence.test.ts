import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DashboardStore, RecurringTask, Task } from "@/lib/types";
import {
  CATCHUP_DAYS,
  LOOKAHEAD_DAYS,
  MAX_RECURRING_RULES,
  RECURRING_CAP_MESSAGE,
  applyRuleEdit,
  cleanRuleFields,
  createRule,
  deleteRule,
  generateAll,
  generationWindow,
  isRuleEnded,
  isUntouchedInstance,
  nextOccurrence,
  normalizeRecurringTasks,
  occursOn,
  occurrencesBetween,
  planGeneration,
  ruleSummary,
  upcomingDates,
  validateRule,
  type RecurringRuleFields,
} from "@/lib/recurrence";
import { draftFromRule, draftToPatch, newDraft, toggleWeekday } from "@/lib/recurrence-draft";
import { shiftDayKey, todayKey } from "@/lib/task-board";
import { updateTaskSchema } from "@/lib/validation";

// 2026-10-05 is a Monday. 2026-11-01 is a Sunday. Sun = 0 ... Sat = 6.
const MON = 1;
const TUE = 2;
const FRI = 5;

function rule(overrides: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: "r1",
    title: "Standup notes",
    cadence: "daily",
    startDate: "2026-01-01",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function store(overrides: Partial<DashboardStore> = {}): DashboardStore {
  return {
    profile: { name: "T", role: "R", company: "C" },
    tasks: [],
    releases: [],
    outings: [],
    slackItems: [],
    mailItems: [],
    sprintApprovals: [],
    projectResources: [],
    plotBacklog: [],
    features: [],
    scrumMembers: [],
    scrumAttendance: [],
    scrumHolidays: [],
    recurringTasks: [],
    lastUpdated: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function counter() {
  let n = 0;
  return () => `t${++n}`;
}

const NOW = "2026-10-05T09:00:00.000Z";

function instances(s: DashboardStore, id = "r1"): Task[] {
  return s.tasks.filter((t) => t.recurringId === id);
}
function days(s: DashboardStore, id = "r1"): string[] {
  return instances(s, id)
    .map((t) => t.dueDate!)
    .sort();
}

describe("constants", () => {
  it("looks one day ahead and never catches up", () => {
    expect(LOOKAHEAD_DAYS).toBe(1);
    expect(CATCHUP_DAYS).toBe(0);
  });
});

describe("occursOn", () => {
  it("daily fires every day within the bounds", () => {
    const r = rule({ startDate: "2026-10-05", endDate: "2026-10-07" });
    expect(occursOn(r, "2026-10-04")).toBe(false);
    expect(occursOn(r, "2026-10-05")).toBe(true);
    expect(occursOn(r, "2026-10-07")).toBe(true);
    expect(occursOn(r, "2026-10-08")).toBe(false);
  });

  it("weekly fires on every chosen weekday only", () => {
    const r = rule({ cadence: "weekly", weekdays: [MON, TUE] });
    expect(occursOn(r, "2026-10-05")).toBe(true); // Mon
    expect(occursOn(r, "2026-10-06")).toBe(true); // Tue
    expect(occursOn(r, "2026-10-07")).toBe(false); // Wed
    expect(occursOn(r, "2026-10-11")).toBe(false); // Sun
  });

  it("monthly 1st Monday is the Monday in days 1-7 even when the 1st is a Sunday", () => {
    const r = rule({
      cadence: "monthly",
      monthlyMode: "weekday_of_month",
      weekOfMonth: 1,
      weekdays: [MON],
    });
    expect(occursOn(r, "2026-11-02")).toBe(true); // Nov 1 is a Sunday
    expect(occursOn(r, "2026-11-09")).toBe(false);
    expect(occursOn(r, "2026-10-05")).toBe(true); // Oct 1 is a Thursday
    expect(occursOn(r, "2026-10-12")).toBe(false);
  });

  it("monthly 2nd/3rd/4th follow days 8-14, 15-21, 22-28", () => {
    const make = (n: 2 | 3 | 4) =>
      rule({ cadence: "monthly", monthlyMode: "weekday_of_month", weekOfMonth: n, weekdays: [MON] });
    expect(occursOn(make(2), "2026-10-12")).toBe(true);
    expect(occursOn(make(3), "2026-10-19")).toBe(true);
    expect(occursOn(make(4), "2026-10-26")).toBe(true);
    expect(occursOn(make(4), "2026-10-19")).toBe(false);
  });

  it("monthly Last Friday is right in a 5-Friday month and a 4-Friday month", () => {
    const last = rule({
      cadence: "monthly",
      monthlyMode: "weekday_of_month",
      weekOfMonth: "last",
      weekdays: [FRI],
    });
    // Oct 2026 has 5 Fridays (2, 9, 16, 23, 30).
    expect(occursOn(last, "2026-10-30")).toBe(true);
    expect(occursOn(last, "2026-10-23")).toBe(false);
    // Nov 2026 has 4 Fridays (6, 13, 20, 27).
    expect(occursOn(last, "2026-11-27")).toBe(true);
    expect(occursOn(last, "2026-11-20")).toBe(false);
  });

  it("monthly weekday with several weekdays fires on each of them", () => {
    const r = rule({
      cadence: "monthly",
      monthlyMode: "weekday_of_month",
      weekOfMonth: 1,
      weekdays: [MON, FRI],
    });
    // Oct 2026: 1st Fri is the 2nd, 1st Mon is the 5th.
    expect(occurrencesBetween(r, "2026-10-01", "2026-10-31")).toEqual(["2026-10-02", "2026-10-05"]);
  });

  it("day of month 5 fires on the 5th", () => {
    const r = rule({ cadence: "monthly", monthlyMode: "day_of_month", dayOfMonth: 5 });
    expect(occursOn(r, "2026-10-05")).toBe(true);
    expect(occursOn(r, "2026-10-06")).toBe(false);
  });

  it("day 29-31 clamps to the last day of shorter months", () => {
    const r31 = rule({ cadence: "monthly", monthlyMode: "day_of_month", dayOfMonth: 31 });
    expect(occursOn(r31, "2026-04-30")).toBe(true); // 30-day month
    expect(occursOn(r31, "2026-04-29")).toBe(false);
    expect(occursOn(r31, "2026-02-28")).toBe(true);
    expect(occursOn(r31, "2026-01-31")).toBe(true);
    expect(occursOn(r31, "2026-01-30")).toBe(false);

    const r30 = rule({ cadence: "monthly", monthlyMode: "day_of_month", dayOfMonth: 30 });
    expect(occursOn(r30, "2026-02-28")).toBe(true);
    expect(occursOn(r30, "2026-04-30")).toBe(true);
    expect(occursOn(r30, "2026-04-29")).toBe(false);
  });

  it("day 29 is Feb 29 in a leap year and Feb 28 otherwise", () => {
    const r = rule({
      cadence: "monthly",
      monthlyMode: "day_of_month",
      dayOfMonth: 29,
      startDate: "2020-01-01",
    });
    expect(occursOn(r, "2024-02-29")).toBe(true);
    expect(occursOn(r, "2024-02-28")).toBe(false);
    expect(occursOn(r, "2026-02-28")).toBe(true);
    expect(occursOn(r, "2026-03-29")).toBe(true);
    // Century rule: 2100 is not a leap year.
    expect(occursOn(r, "2100-02-28")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    const r = rule();
    expect(occursOn(r, "2026-02-30")).toBe(false);
    expect(occursOn(r, "nope")).toBe(false);
  });

  it("ignores the active flag (pausing is handled by generation)", () => {
    expect(occursOn(rule({ active: false }), "2026-10-05")).toBe(true);
  });
});

describe("occurrencesBetween", () => {
  const weekly = rule({ cadence: "weekly", weekdays: [MON, TUE] });

  it("is inclusive and ascending", () => {
    expect(occurrencesBetween(weekly, "2026-10-05", "2026-10-13")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-12",
      "2026-10-13",
    ]);
  });

  it("is empty when from > to", () => {
    expect(occurrencesBetween(weekly, "2026-10-13", "2026-10-05")).toEqual([]);
  });

  it("is empty when the rule is paused", () => {
    expect(occurrencesBetween({ ...weekly, active: false }, "2026-10-05", "2026-10-13")).toEqual([]);
  });

  it("clamps to the start and end dates", () => {
    const bounded = rule({ startDate: "2026-10-07", endDate: "2026-10-09" });
    expect(occurrencesBetween(bounded, "2026-10-01", "2026-10-31")).toEqual([
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
  });

  it("returns a single day when from = to", () => {
    expect(occurrencesBetween(rule(), "2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
    expect(occurrencesBetween(weekly, "2026-10-07", "2026-10-07")).toEqual([]);
  });

  it("crosses the year boundary", () => {
    expect(occurrencesBetween(rule(), "2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("returns [] for malformed input", () => {
    expect(occurrencesBetween(rule(), "x", "2026-10-05")).toEqual([]);
  });
});

describe("nextOccurrence", () => {
  it("returns the first date strictly after the given day", () => {
    const r = rule({ cadence: "weekly", weekdays: [MON, TUE] });
    expect(nextOccurrence(r, "2026-10-05")).toBe("2026-10-06");
    expect(nextOccurrence(r, "2026-10-06")).toBe("2026-10-12");
    expect(nextOccurrence(r, "2026-10-04")).toBe("2026-10-05");
  });

  it("is never earlier than the start date", () => {
    const r = rule({ startDate: "2026-12-01" });
    expect(nextOccurrence(r, "2026-10-05")).toBe("2026-12-01");
  });

  it("is undefined once the rule has ended", () => {
    const r = rule({ endDate: "2026-10-06" });
    expect(nextOccurrence(r, "2026-10-05")).toBe("2026-10-06");
    expect(nextOccurrence(r, "2026-10-06")).toBeUndefined();
    expect(nextOccurrence(r, "2027-01-01")).toBeUndefined();
  });

  it("is undefined when no date matches before the end", () => {
    const r = rule({ cadence: "weekly", weekdays: [FRI], endDate: "2026-10-07" });
    expect(nextOccurrence(r, "2026-10-05")).toBeUndefined();
  });

  it("finds the next Last Friday across months", () => {
    const r = rule({
      cadence: "monthly",
      monthlyMode: "weekday_of_month",
      weekOfMonth: "last",
      weekdays: [FRI],
    });
    expect(nextOccurrence(r, "2026-10-30")).toBe("2026-11-27");
    expect(nextOccurrence(r, "2026-11-27")).toBe("2026-12-25");
  });

  it("finds Day 31 in months that have one and clamps in the others", () => {
    const r = rule({ cadence: "monthly", monthlyMode: "day_of_month", dayOfMonth: 31 });
    expect(nextOccurrence(r, "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(r, "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence(r, "2026-03-31")).toBe("2026-04-30");
  });

  it("is bounded: a rule with no weekdays returns undefined instead of looping", () => {
    const r = rule({ cadence: "weekly", weekdays: [] });
    expect(nextOccurrence(r, "2026-10-05")).toBeUndefined();
  });

  it("ignores the active flag", () => {
    expect(nextOccurrence(rule({ active: false }), "2026-10-05")).toBe("2026-10-06");
  });
});

describe("upcomingDates", () => {
  it("includes today when it matches", () => {
    const r = rule({ cadence: "weekly", weekdays: [MON, TUE] });
    expect(upcomingDates(r, "2026-10-05", 3)).toEqual(["2026-10-05", "2026-10-06", "2026-10-12"]);
  });

  it("returns fewer dates when the rule ends", () => {
    expect(upcomingDates(rule({ endDate: "2026-10-06" }), "2026-10-05", 3)).toEqual([
      "2026-10-05",
      "2026-10-06",
    ]);
  });
});

describe("ruleSummary", () => {
  it("describes each cadence", () => {
    expect(ruleSummary(rule())).toBe("Every day");
    expect(ruleSummary(rule({ cadence: "weekly", weekdays: [1, 2, 3, 4, 5] }))).toBe("Every weekday");
    expect(ruleSummary(rule({ cadence: "weekly", weekdays: [TUE, MON] }))).toBe("Every Mon, Tue");
    expect(ruleSummary(rule({ cadence: "weekly", weekdays: [0, 6] }))).toBe("Every Sat, Sun");
    expect(ruleSummary(rule({ cadence: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] }))).toBe("Every day");
    expect(
      ruleSummary(
        rule({ cadence: "monthly", monthlyMode: "weekday_of_month", weekOfMonth: 1, weekdays: [MON] })
      )
    ).toBe("1st Mon of every month");
    expect(
      ruleSummary(
        rule({ cadence: "monthly", monthlyMode: "weekday_of_month", weekOfMonth: 3, weekdays: [FRI] })
      )
    ).toBe("3rd Fri of every month");
    expect(
      ruleSummary(
        rule({ cadence: "monthly", monthlyMode: "weekday_of_month", weekOfMonth: "last", weekdays: [FRI] })
      )
    ).toBe("Last Fri of every month");
    expect(
      ruleSummary(rule({ cadence: "monthly", monthlyMode: "day_of_month", dayOfMonth: 5 }))
    ).toBe("Day 5 of every month");
    expect(
      ruleSummary(rule({ cadence: "monthly", monthlyMode: "day_of_month", dayOfMonth: 31 }))
    ).toBe("Day 31 of every month (last day in shorter months)");
  });
});

describe("isRuleEnded", () => {
  it("is true only once the end date is behind today", () => {
    expect(isRuleEnded({ endDate: "2026-10-04" }, "2026-10-05")).toBe(true);
    expect(isRuleEnded({ endDate: "2026-10-05" }, "2026-10-05")).toBe(false);
    expect(isRuleEnded({}, "2026-10-05")).toBe(false);
  });
});

describe("validateRule", () => {
  const ok: RecurringRuleFields = { title: "x", cadence: "daily", startDate: "2026-10-05" };

  it("accepts a valid daily rule", () => {
    expect(validateRule(ok)).toEqual({});
  });

  it("requires a title and a start date", () => {
    expect(validateRule({ ...ok, title: "  " }).title).toBe("Title required");
    expect(validateRule({ ...ok, startDate: "" }).startDate).toBe("Start date is required");
    expect(validateRule({ ...ok, startDate: "2026-02-30" }).startDate).toBe("Start date is required");
  });

  it("rejects an end date before the start date", () => {
    expect(validateRule({ ...ok, endDate: "2026-10-04" }).endDate).toBe(
      "End date can't be before start date"
    );
    expect(validateRule({ ...ok, endDate: "2026-10-05" })).toEqual({});
  });

  it("requires at least one weekday for weekly and for monthly on-week", () => {
    expect(validateRule({ ...ok, cadence: "weekly", weekdays: [] }).weekdays).toBe(
      "Pick at least one day"
    );
    expect(validateRule({ ...ok, cadence: "weekly", weekdays: [9] }).weekdays).toBe(
      "Pick at least one day"
    );
    expect(
      validateRule({ ...ok, cadence: "monthly", monthlyMode: "weekday_of_month", weekOfMonth: 1, weekdays: [] })
        .weekdays
    ).toBe("Pick at least one day");
  });

  it("requires a valid day of month for monthly on-day", () => {
    const base = { ...ok, cadence: "monthly" as const, monthlyMode: "day_of_month" as const };
    expect(validateRule(base).dayOfMonth).toBe("Day of month must be 1 to 31");
    expect(validateRule({ ...base, dayOfMonth: 0 }).dayOfMonth).toBeDefined();
    expect(validateRule({ ...base, dayOfMonth: 32 }).dayOfMonth).toBeDefined();
    expect(validateRule({ ...base, dayOfMonth: 2.5 }).dayOfMonth).toBeDefined();
    expect(validateRule({ ...base, dayOfMonth: Number.NaN }).dayOfMonth).toBeDefined();
    expect(validateRule({ ...base, dayOfMonth: 31 })).toEqual({});
  });

  it("requires a monthly mode and a week of the month", () => {
    expect(validateRule({ ...ok, cadence: "monthly" }).monthlyMode).toBeDefined();
    expect(
      validateRule({ ...ok, cadence: "monthly", monthlyMode: "weekday_of_month", weekdays: [MON] }).weekOfMonth
    ).toBeDefined();
  });

  it("rejects an unknown cadence", () => {
    expect(validateRule({ ...ok, cadence: "yearly" as never }).cadence).toBeDefined();
  });
});

describe("cleanRuleFields", () => {
  it("drops fields the cadence does not use and sorts and de-duplicates weekdays", () => {
    const cleaned = cleanRuleFields({
      title: "  Hi ",
      comment: "  ",
      cadence: "weekly",
      weekdays: [5, 1, 5, 9, -1],
      monthlyMode: "day_of_month",
      dayOfMonth: 4,
      weekOfMonth: 2,
      startDate: "2026-10-05",
      endDate: "",
    });
    expect(cleaned).toEqual({
      title: "Hi",
      cadence: "weekly",
      weekdays: [1, 5],
      startDate: "2026-10-05",
    });
  });
});

describe("normalizeRecurringTasks", () => {
  it("returns [] when the key is absent or not an array", () => {
    expect(normalizeRecurringTasks(undefined)).toEqual([]);
    expect(normalizeRecurringTasks(null)).toEqual([]);
    expect(normalizeRecurringTasks("x")).toEqual([]);
  });

  it("drops rules with an invalid cadence or date, keeps good ones", () => {
    const good = rule({ id: "good" });
    const out = normalizeRecurringTasks([
      good,
      { ...good, id: "bad-cadence", cadence: "yearly" },
      { ...good, id: "bad-start", startDate: "2026-13-01" },
      { ...good, id: "bad-end", endDate: "soon" },
      { ...good, id: "no-title", title: undefined },
      null,
      "junk",
    ]);
    expect(out.map((r) => r.id)).toEqual(["good"]);
  });

  it("drops weekdays outside 0-6 and duplicates", () => {
    const [r] = normalizeRecurringTasks([
      rule({ cadence: "weekly", weekdays: [3, 3, 1, 9, -2, 1.5] as number[] }),
    ]);
    expect(r.weekdays).toEqual([1, 3]);
  });

  it("drops a weekly rule left with no valid weekday", () => {
    expect(normalizeRecurringTasks([rule({ cadence: "weekly", weekdays: [9] })])).toEqual([]);
  });

  it("defaults active to true only when it is missing", () => {
    const { active: _active, ...withoutActive } = rule({ id: "a" });
    void _active;
    const out = normalizeRecurringTasks([withoutActive, rule({ id: "b", active: false })]);
    expect(out.find((r) => r.id === "a")?.active).toBe(true);
    expect(out.find((r) => r.id === "b")?.active).toBe(false);
  });

  it("drops duplicate ids and a malformed generatedThrough", () => {
    const out = normalizeRecurringTasks([
      rule({ id: "x", generatedThrough: "nope" }),
      rule({ id: "x", title: "dup" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].generatedThrough).toBeUndefined();
  });
});

describe("generationWindow and planGeneration", () => {
  const TODAY = "2026-10-05";

  it("is today..tomorrow for a rule that has not generated yet", () => {
    expect(generationWindow(rule(), TODAY)).toEqual({ from: "2026-10-05", to: "2026-10-06" });
  });

  it("never starts before the start date", () => {
    expect(generationWindow(rule({ startDate: "2026-10-06" }), TODAY)).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
    expect(generationWindow(rule({ startDate: "2026-10-07" }), TODAY)).toBeNull();
  });

  it("starts after the marker and never before today (no catch-up)", () => {
    expect(generationWindow(rule({ generatedThrough: "2026-10-05" }), TODAY)).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
    expect(generationWindow(rule({ generatedThrough: "2026-09-01" }), TODAY)).toEqual({
      from: "2026-10-05",
      to: "2026-10-06",
    });
    expect(generationWindow(rule({ generatedThrough: "2026-10-06" }), TODAY)).toBeNull();
  });

  it("stops at the end date and is null when paused or ended", () => {
    expect(generationWindow(rule({ endDate: "2026-10-05" }), TODAY)).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect(generationWindow(rule({ endDate: "2026-10-04" }), TODAY)).toBeNull();
    expect(generationWindow(rule({ active: false }), TODAY)).toBeNull();
  });

  it("plans today and tomorrow for a daily rule", () => {
    expect(planGeneration(rule(), TODAY, [])).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("plans only matching weekdays", () => {
    const r = rule({ cadence: "weekly", weekdays: [TUE] });
    expect(planGeneration(r, TODAY, [])).toEqual(["2026-10-06"]);
  });

  it("skips days that already have an instance of this rule only", () => {
    const existing = [
      { id: "a", recurringId: "r1", dueDate: "2026-10-05" },
      { id: "b", recurringId: "other", dueDate: "2026-10-06" },
    ] as Task[];
    expect(planGeneration(rule(), TODAY, existing)).toEqual(["2026-10-06"]);
  });

  it("plans nothing for a paused rule even after weeks", () => {
    const r = rule({ active: false, generatedThrough: "2026-08-01" });
    expect(planGeneration(r, TODAY, [])).toEqual([]);
  });

  it("uses the supplied local today, so 00:30 local is still that local day", () => {
    // Late evening UTC is already the next local day in IST; the caller's key is what counts.
    const localAt0030 = new Date(2026, 9, 6, 0, 30);
    expect(todayKey(localAt0030)).toBe("2026-10-06");
    expect(planGeneration(rule(), todayKey(localAt0030), [])).toEqual(["2026-10-06", "2026-10-07"]);
  });
});

describe("generateAll", () => {
  const TODAY = "2026-10-05";

  it("creates ordinary todo rows with the rule's title and comment", () => {
    const s = store({
      recurringTasks: [rule({ comment: "Share in channel", generatedThrough: "2026-10-04" })],
    });
    const { store: next, created } = generateAll(s, TODAY, NOW, counter());
    expect(created).toBe(2);
    expect(next.tasks).toEqual([
      {
        id: "t1",
        title: "Standup notes",
        description: "Share in channel",
        status: "todo",
        priority: "medium",
        source: "manual",
        dueDate: "2026-10-05",
        tags: [],
        recurringId: "r1",
        createdAt: NOW,
        updatedAt: NOW,
      },
      expect.objectContaining({ id: "t2", dueDate: "2026-10-06", recurringId: "r1" }),
    ]);
    expect(next.recurringTasks![0].generatedThrough).toBe("2026-10-06");
  });

  it("is idempotent: a second run creates nothing and returns the same store", () => {
    const s = store({ recurringTasks: [rule()] });
    const first = generateAll(s, TODAY, NOW, counter());
    const second = generateAll(first.store, TODAY, NOW, counter());
    expect(second.created).toBe(0);
    expect(second.store).toBe(first.store);
    expect(first.store.tasks).toHaveLength(2);
  });

  it("creates no duplicates when two runs start from the same stale store (Blob retry)", () => {
    const s = store({ recurringTasks: [rule()] });
    const a = generateAll(s, TODAY, NOW, counter());
    const b = generateAll(s, TODAY, NOW, counter());
    expect(days(a.store)).toEqual(days(b.store));
    // Replaying the updater on its own result (marker lost) is still guarded by recurringId+dueDate.
    const replay = generateAll(
      { ...a.store, recurringTasks: [rule()] },
      TODAY,
      NOW,
      counter()
    );
    expect(replay.created).toBe(0);
    expect(days(replay.store)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("does nothing without rules and returns the same object", () => {
    const s = store();
    expect(generateAll(s, TODAY, NOW).store).toBe(s);
    const legacy = store();
    delete legacy.recurringTasks;
    expect(generateAll(legacy, TODAY, NOW).store).toBe(legacy);
  });

  it("never recreates a deleted instance", () => {
    const s = store({ recurringTasks: [rule()] });
    const first = generateAll(s, TODAY, NOW, counter());
    const withoutToday: DashboardStore = {
      ...first.store,
      tasks: first.store.tasks.filter((t) => t.dueDate !== "2026-10-05"),
    };
    const again = generateAll(withoutToday, TODAY, NOW, counter());
    expect(again.created).toBe(0);
    expect(days(again.store)).toEqual(["2026-10-06"]);
  });

  it("never recreates a completed or moved instance", () => {
    const first = generateAll(store({ recurringTasks: [rule()] }), TODAY, NOW, counter());
    const edited: DashboardStore = {
      ...first.store,
      tasks: first.store.tasks.map((t) =>
        t.dueDate === "2026-10-05"
          ? { ...t, status: "done" as const }
          : { ...t, dueDate: "2026-10-20" }
      ),
    };
    const again = generateAll(edited, TODAY, NOW, counter());
    expect(again.created).toBe(0);
    expect(days(again.store)).toEqual(["2026-10-05", "2026-10-20"]);
  });

  it("creates no past days after the app was closed for a while, and never before the start date", () => {
    const s = store({
      recurringTasks: [rule({ startDate: "2026-09-01", generatedThrough: "2026-09-10" })],
    });
    const { store: next, created } = generateAll(s, TODAY, NOW, counter());
    expect(created).toBe(2);
    expect(days(next)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(next.recurringTasks![0].generatedThrough).toBe("2026-10-06");
  });

  it("creates nothing before a future start date, then reveals it one day early", () => {
    const r = rule({ startDate: "2026-10-10", generatedThrough: "2026-10-09" });
    expect(generateAll(store({ recurringTasks: [r] }), "2026-10-07", NOW).created).toBe(0);
    const reveal = generateAll(store({ recurringTasks: [r] }), "2026-10-09", NOW, counter());
    expect(days(reveal.store)).toEqual(["2026-10-10"]);
  });

  it("stops at the end date", () => {
    const r = rule({ endDate: "2026-10-05", generatedThrough: "2026-10-04" });
    const { store: next, created } = generateAll(store({ recurringTasks: [r] }), TODAY, NOW, counter());
    expect(created).toBe(1);
    expect(days(next)).toEqual(["2026-10-05"]);
    expect(generateAll(next, "2026-10-06", NOW).created).toBe(0);
  });

  it("creates nothing for a rule already past its end date", () => {
    const r = rule({ endDate: "2026-10-01" });
    expect(generateAll(store({ recurringTasks: [r] }), TODAY, NOW).created).toBe(0);
  });

  it("skips paused rules and does not advance their marker", () => {
    const r = rule({ active: false, generatedThrough: "2026-09-01" });
    const s = store({ recurringTasks: [r] });
    const result = generateAll(s, TODAY, NOW);
    expect(result.created).toBe(0);
    expect(result.store).toBe(s);
  });

  it("creates at most two rows per daily rule per run", () => {
    const s = store({ recurringTasks: [rule()] });
    expect(generateAll(s, TODAY, NOW, counter()).created).toBe(2);
    expect(generateAll(s, "2027-03-01", NOW, counter()).created).toBe(2);
  });

  it("orders several rules' rows by rule createdAt", () => {
    const early = rule({ id: "early", title: "Early", createdAt: "2026-01-01T00:00:00.000Z" });
    const late = rule({ id: "late", title: "Late", createdAt: "2026-02-01T00:00:00.000Z" });
    const { store: next } = generateAll(store({ recurringTasks: [late, early] }), TODAY, NOW, counter());
    expect(next.tasks.map((t) => t.recurringId)).toEqual(["early", "early", "late", "late"]);
  });

  it("leaves non-recurring tasks untouched", () => {
    const manual = { id: "m", title: "Manual", dueDate: "2026-10-05" } as Task;
    const { store: next } = generateAll(store({ tasks: [manual], recurringTasks: [rule()] }), TODAY, NOW);
    expect(next.tasks[0]).toBe(manual);
  });

  it("ignores a malformed today", () => {
    const s = store({ recurringTasks: [rule()] });
    expect(generateAll(s, "10/05/2026", NOW).store).toBe(s);
  });
});

describe("createRule", () => {
  const TODAY = "2026-10-05";
  const fields: RecurringRuleFields = { title: "Daily sync", cadence: "daily", startDate: TODAY };

  it("starts with no backfill and creates today's and tomorrow's rows at once", () => {
    const result = createRule(store(), fields, TODAY, NOW, "new", counter());
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.created).toBe(2);
    expect(days(result.store, "new")).toEqual(["2026-10-05", "2026-10-06"]);
    expect(result.rule.generatedThrough).toBe("2026-10-06");
    expect(result.rule.active).toBe(true);
  });

  it("does not backfill a start date in the past", () => {
    const result = createRule(store(), { ...fields, startDate: "2026-01-01" }, TODAY, NOW, "new", counter());
    if (result.status !== "ok") throw new Error(result.status);
    expect(days(result.store, "new")).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("waits for a future start date", () => {
    const result = createRule(store(), { ...fields, startDate: "2026-10-20" }, TODAY, NOW, "new", counter());
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.created).toBe(0);
    expect(result.rule.generatedThrough).toBe("2026-10-19");
  });

  it("creates only the matching day for a weekly rule (Tue only, today is Monday)", () => {
    const result = createRule(
      store(),
      { title: "T", cadence: "weekly", weekdays: [TUE], startDate: TODAY },
      TODAY,
      NOW,
      "new",
      counter()
    );
    if (result.status !== "ok") throw new Error(result.status);
    expect(days(result.store, "new")).toEqual(["2026-10-06"]);
  });

  it("rejects an invalid rule with the field message", () => {
    const result = createRule(store(), { ...fields, title: "" }, TODAY, NOW, "new");
    expect(result).toEqual({ status: "invalid", error: "Title required" });
  });

  it("enforces the 100 rule cap", () => {
    const rules = Array.from({ length: MAX_RECURRING_RULES }, (_, i) => rule({ id: `r${i}` }));
    const result = createRule(store({ recurringTasks: rules }), fields, TODAY, NOW, "new");
    expect(result).toEqual({ status: "invalid", error: RECURRING_CAP_MESSAGE });
  });

  it("works on a legacy store with no recurringTasks key", () => {
    const legacy = store();
    delete legacy.recurringTasks;
    const result = createRule(legacy, fields, TODAY, NOW, "new", counter());
    expect(result.status).toBe("ok");
  });
});

describe("isUntouchedInstance", () => {
  const r = rule({ comment: "c" });
  const base = {
    id: "t",
    title: "Standup notes",
    description: "c",
    status: "todo",
    recurringId: "r1",
    dueDate: "2026-10-06",
  } as Task;

  it("is true for an unchanged todo row", () => {
    expect(isUntouchedInstance(base, r)).toBe(true);
    expect(isUntouchedInstance(base, r, "2026-10-05")).toBe(true);
  });

  it("is false once status, title or comment changed, or for another rule", () => {
    expect(isUntouchedInstance({ ...base, status: "in_progress" }, r)).toBe(false);
    expect(isUntouchedInstance({ ...base, status: "done" }, r)).toBe(false);
    expect(isUntouchedInstance({ ...base, title: "Renamed" }, r)).toBe(false);
    expect(isUntouchedInstance({ ...base, description: "edited" }, r)).toBe(false);
    expect(isUntouchedInstance({ ...base, recurringId: "other" }, r)).toBe(false);
  });

  it("treats a missing comment and an empty one as equal", () => {
    expect(isUntouchedInstance({ ...base, description: undefined }, rule())).toBe(true);
    expect(isUntouchedInstance({ ...base, description: "" }, rule())).toBe(true);
  });

  it("with today, only future rows count", () => {
    expect(isUntouchedInstance({ ...base, dueDate: "2026-10-05" }, r, "2026-10-05")).toBe(false);
    expect(isUntouchedInstance({ ...base, dueDate: "2026-10-04" }, r, "2026-10-05")).toBe(false);
    expect(isUntouchedInstance({ ...base, dueDate: undefined }, r, "2026-10-05")).toBe(false);
  });
});

describe("applyRuleEdit", () => {
  const TODAY = "2026-10-05"; // Monday

  function seeded(overrides: Partial<RecurringTask> = {}): DashboardStore {
    const created = createRule(
      store(),
      { title: "Daily sync", comment: "notes", cadence: "daily", startDate: TODAY },
      TODAY,
      NOW,
      "r1",
      counter()
    );
    if (created.status !== "ok") throw new Error("setup");
    return {
      ...created.store,
      recurringTasks: created.store.recurringTasks!.map((r) => ({ ...r, ...overrides })),
    };
  }

  function edit(s: DashboardStore, patch: Parameters<typeof applyRuleEdit>[2], today = TODAY) {
    const result = applyRuleEdit(s, "r1", patch, today, "2026-10-05T10:00:00.000Z", counter());
    if (result.status !== "ok") throw new Error(`${result.status}`);
    return result;
  }

  it("rewrites untouched future rows from the new rule and keeps today's row", () => {
    const s = seeded();
    const todayRow = s.tasks.find((t) => t.dueDate === TODAY)!;
    const { store: next } = edit(s, { title: "Renamed", comment: null });
    const todays = next.tasks.find((t) => t.dueDate === TODAY)!;
    expect(todays).toBe(todayRow); // an existing today row is never changed
    expect(todays.title).toBe("Daily sync");
    const tomorrow = next.tasks.filter((t) => t.dueDate === "2026-10-06");
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0].title).toBe("Renamed");
    expect(tomorrow[0].description).toBeUndefined();
  });

  it("keeps a touched future row (status or text changed) and does not duplicate that day", () => {
    const s = seeded();
    const touchedStore: DashboardStore = {
      ...s,
      tasks: s.tasks.map((t) =>
        t.dueDate === "2026-10-06" ? { ...t, title: "My own title" } : t
      ),
    };
    const { store: next } = edit(touchedStore, { title: "Renamed" });
    const tomorrow = next.tasks.filter((t) => t.dueDate === "2026-10-06");
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0].title).toBe("My own title");
  });

  it("leaves past rows alone", () => {
    const past = {
      id: "p",
      title: "Daily sync",
      description: "notes",
      status: "todo",
      recurringId: "r1",
      dueDate: "2026-10-03",
    } as Task;
    const s = seeded();
    const { store: next } = edit({ ...s, tasks: [past, ...s.tasks] }, { title: "Renamed" });
    expect(next.tasks).toContain(past);
  });

  it("does not recreate a deleted today row when an edit still includes today", () => {
    const s = seeded();
    const noToday: DashboardStore = { ...s, tasks: s.tasks.filter((t) => t.dueDate !== TODAY) };
    const { store: next } = edit(noToday, { title: "Renamed" });
    expect(days(next)).toEqual(["2026-10-06"]);
  });

  it("creates today's row at once when the edit newly includes today", () => {
    // Tuesday-only rule created on Monday: only tomorrow's row exists.
    const created = createRule(
      store(),
      { title: "Tue thing", cadence: "weekly", weekdays: [TUE], startDate: TODAY },
      TODAY,
      NOW,
      "r1",
      counter()
    );
    if (created.status !== "ok") throw new Error("setup");
    expect(days(created.store)).toEqual(["2026-10-06"]);
    const { store: next } = edit(created.store, { weekdays: [MON, TUE] });
    expect(days(next)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("does not touch today when an edit removes today from the rule", () => {
    const s = seeded();
    const { store: next } = edit(s, { cadence: "weekly", weekdays: [TUE] });
    expect(days(next)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("an end date in the past stops new rows and drops untouched tomorrow", () => {
    const s = seeded();
    const { store: next } = edit(s, { endDate: "2026-10-05" });
    expect(days(next)).toEqual(["2026-10-05"]);
  });

  it("pause removes untouched future rows, keeps today's, and keeps touched ones", () => {
    const s = seeded();
    const { store: paused, rule: pausedRule } = edit(s, { active: false });
    expect(pausedRule.active).toBe(false);
    expect(days(paused)).toEqual(["2026-10-05"]);

    const touched: DashboardStore = {
      ...s,
      tasks: s.tasks.map((t) => (t.dueDate === "2026-10-06" ? { ...t, status: "in_progress" as const } : t)),
    };
    expect(days(edit(touched, { active: false }).store)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("a paused rule creates nothing, even weeks later", () => {
    const { store: paused } = edit(seeded(), { active: false });
    const later = generateAll(paused, "2026-11-20", NOW, counter());
    expect(later.created).toBe(0);
  });

  it("resume continues from today with no backfill", () => {
    const { store: paused } = edit(seeded(), { active: false });
    const { store: resumed } = edit(paused, { active: true }, "2026-11-20");
    expect(days(resumed)).toEqual(["2026-10-05", "2026-11-20", "2026-11-21"]);
  });

  it("resume the same day does not recreate today's row if the user deleted it", () => {
    const s = seeded();
    const noToday: DashboardStore = { ...s, tasks: s.tasks.filter((t) => t.dueDate !== TODAY) };
    const { store: paused } = edit(noToday, { active: false });
    const { store: resumed } = edit(paused, { active: true });
    expect(days(resumed)).toEqual(["2026-10-06"]);
  });

  it("clearing the end date with null re-opens the rule", () => {
    const s = seeded({ endDate: "2026-10-05" });
    const { rule: next } = edit(s, { endDate: null });
    expect(next.endDate).toBeUndefined();
  });

  it("switching cadence drops fields the new cadence does not use", () => {
    const { rule: weekly } = edit(seeded(), { cadence: "weekly", weekdays: [MON] });
    expect(weekly.weekdays).toEqual([MON]);
    const { rule: daily } = edit({ ...seeded(), recurringTasks: [weekly] }, { cadence: "daily" });
    expect(daily.weekdays).toBeUndefined();
  });

  it("reports not found and invalid edits without changing anything", () => {
    const s = seeded();
    expect(applyRuleEdit(s, "nope", { title: "x" }, TODAY, NOW)).toEqual({ status: "not_found" });
    expect(applyRuleEdit(s, "r1", { title: " " }, TODAY, NOW)).toEqual({
      status: "invalid",
      error: "Title required",
    });
    expect(applyRuleEdit(s, "r1", { endDate: "2026-01-01" }, TODAY, NOW)).toEqual({
      status: "invalid",
      error: "End date can't be before start date",
    });
    expect(applyRuleEdit(s, "r1", { cadence: "weekly" }, TODAY, NOW)).toEqual({
      status: "invalid",
      error: "Pick at least one day",
    });
  });
});

describe("deleteRule", () => {
  const TODAY = "2026-10-05";

  it("removes the rule and untouched future rows, and turns the rest into plain tasks", () => {
    const created = createRule(
      store(),
      { title: "Daily sync", cadence: "daily", startDate: TODAY },
      TODAY,
      NOW,
      "r1",
      counter()
    );
    if (created.status !== "ok") throw new Error("setup");
    const result = deleteRule(created.store, "r1", TODAY);
    if (result.status !== "ok") throw new Error("setup");
    expect(result.store.recurringTasks).toEqual([]);
    expect(result.store.tasks).toHaveLength(1);
    expect(result.store.tasks[0].dueDate).toBe(TODAY);
    expect(result.store.tasks[0]).not.toHaveProperty("recurringId");
  });

  it("keeps touched future rows as plain tasks", () => {
    const created = createRule(
      store(),
      { title: "Daily sync", cadence: "daily", startDate: TODAY },
      TODAY,
      NOW,
      "r1",
      counter()
    );
    if (created.status !== "ok") throw new Error("setup");
    const touched: DashboardStore = {
      ...created.store,
      tasks: created.store.tasks.map((t) =>
        t.dueDate === "2026-10-06" ? { ...t, status: "done" as const } : t
      ),
    };
    const result = deleteRule(touched, "r1", TODAY);
    if (result.status !== "ok") throw new Error("setup");
    expect(result.store.tasks).toHaveLength(2);
    expect(result.store.tasks.every((t) => t.recurringId === undefined)).toBe(true);
  });

  it("does not touch other rules' rows and reports not found", () => {
    const s = store({
      recurringTasks: [rule({ id: "a" }), rule({ id: "b" })],
      tasks: [{ id: "x", title: "x", recurringId: "b", dueDate: "2026-10-06", status: "todo" } as Task],
    });
    const result = deleteRule(s, "a", TODAY);
    if (result.status !== "ok") throw new Error("setup");
    expect(result.store.tasks[0].recurringId).toBe("b");
    expect(deleteRule(s, "missing", TODAY)).toEqual({ status: "not_found" });
  });
});

describe("DST and calendar stepping", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("runs in a DST-observing zone for this block", () => {
    expect(new Date(2026, 2, 15, 12).getTimezoneOffset()).toBe(240);
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(300);
  });

  it("never skips or doubles a date across spring-forward (23h day)", () => {
    // 2026-03-08 is the US spring-forward day.
    const got = occurrencesBetween(rule(), "2026-03-06", "2026-03-10");
    expect(got).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
    expect(shiftDayKey("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftDayKey("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("never skips or doubles a date across fall-back (25h day)", () => {
    // 2026-11-01 is the US fall-back day (a Sunday).
    const got = occurrencesBetween(rule(), "2026-10-30", "2026-11-03");
    expect(got).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
    const weekly = rule({ cadence: "weekly", weekdays: [0] });
    expect(occurrencesBetween(weekly, "2026-10-25", "2026-11-08")).toEqual([
      "2026-10-25",
      "2026-11-01",
      "2026-11-08",
    ]);
  });

  it("1st Monday and Last Friday are right around the DST change", () => {
    const first = rule({
      cadence: "monthly",
      monthlyMode: "weekday_of_month",
      weekOfMonth: 1,
      weekdays: [MON],
    });
    expect(nextOccurrence(first, "2026-10-05")).toBe("2026-11-02");
    const lastSun = rule({
      cadence: "monthly",
      monthlyMode: "weekday_of_month",
      weekOfMonth: "last",
      weekdays: [0],
    });
    expect(nextOccurrence(lastSun, "2026-03-01")).toBe("2026-03-29");
  });

  it("generates exactly one row per day across the change, with no duplicates", () => {
    const s = store({ recurringTasks: [rule({ generatedThrough: "2026-03-06" })] });
    let current = s;
    for (const today of ["2026-03-07", "2026-03-08", "2026-03-09"]) {
      current = generateAll(current, today, NOW, counter()).store;
      current = generateAll(current, today, NOW, counter()).store; // repeat: no-op
    }
    expect(days(current)).toEqual(["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  });

  it("year rollover steps through Dec 31 to Jan 1", () => {
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDayKey("2027-01-01", -1)).toBe("2026-12-31");
    expect(nextOccurrence(rule({ cadence: "weekly", weekdays: [FRI] }), "2026-12-31")).toBe("2027-01-01");
  });

});

describe("recurrence-draft", () => {
  it("starts a new draft as Daily, starting today, no end, monthly on week 1st", () => {
    const d = newDraft("2026-10-05");
    expect(d).toMatchObject({
      title: "",
      cadence: "daily",
      startDate: "2026-10-05",
      endDate: "",
      monthlyMode: "weekday_of_month",
      weekOfMonth: 1,
    });
  });

  it("round-trips a rule through a draft and builds a full PATCH with nulls for cleared fields", () => {
    const r = rule({ cadence: "weekly", weekdays: [MON, TUE], comment: "hello", endDate: "2026-12-01" });
    const d = draftFromRule(r);
    expect(draftToPatch(d)).toMatchObject({
      title: "Standup notes",
      comment: "hello",
      cadence: "weekly",
      weekdays: [MON, TUE],
      endDate: "2026-12-01",
    });
    expect(draftToPatch({ ...d, comment: " ", endDate: "" })).toMatchObject({
      comment: null,
      endDate: null,
    });
  });

  it("toggles weekdays, keeping them sorted", () => {
    expect(toggleWeekday([1, 5], 3)).toEqual([1, 3, 5]);
    expect(toggleWeekday([1, 3, 5], 3)).toEqual([1, 5]);
  });
});

describe("updateTaskSchema and recurringId", () => {
  it("strips recurringId, so the client's whole-task PATCH still succeeds", () => {
    const parsed = updateTaskSchema.safeParse({ id: "t1", status: "done", recurringId: "r1" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("recurringId");
  });
});
