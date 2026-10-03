import { describe, expect, it } from "vitest";
import {
  createOutingExpenseSchema,
  createTaskSchema,
  parseBody,
  slackImportSchema,
  updateOutingExpenseSchema,
  updateTaskSchema,
  upsertScrumAttendanceSchema,
} from "@/lib/validation";

describe("createTaskSchema", () => {
  it("accepts valid tasks", () => {
    const result = parseBody(createTaskSchema, {
      title: "Ship release",
      priority: "high",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty titles", () => {
    const result = parseBody(createTaskSchema, { title: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("requires id and at least one update field", () => {
    const result = parseBody(updateTaskSchema, { id: "task-1" });
    expect(result.success).toBe(false);
  });

  it("accepts status updates", () => {
    const result = parseBody(updateTaskSchema, { id: "task-1", status: "done" });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = parseBody(updateTaskSchema, {
      id: "task-1",
      status: "done",
      maliciousField: "hack",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("maliciousField" in result.data).toBe(false);
    }
  });
});

describe("createOutingExpenseSchema", () => {
  it("accepts a valid expense", () => {
    const result = parseBody(createOutingExpenseSchema, {
      outingId: "out-1",
      title: "Team dinner",
      amount: 22000,
      type: "outing",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive amounts", () => {
    const result = parseBody(createOutingExpenseSchema, {
      outingId: "out-1",
      title: "Snacks",
      amount: 0,
      type: "follow_up",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateOutingExpenseSchema", () => {
  it("requires a field besides ids", () => {
    const result = parseBody(updateOutingExpenseSchema, {
      outingId: "out-1",
      id: "exp-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("upsertScrumAttendanceSchema", () => {
  const body = (date: string, status: string) => ({ date, entries: [{ member: "Pranav", status }] });

  it("rejects '1st half off' before 2026-10-01", () => {
    const result = parseBody(upsertScrumAttendanceSchema, body("2026-09-30", "first_half_off"));
    expect(result.success).toBe(false);
  });

  it("accepts '1st half off' from 2026-10-01", () => {
    const result = parseBody(upsertScrumAttendanceSchema, body("2026-10-01", "first_half_off"));
    expect(result.success).toBe(true);
  });

  it("still accepts other statuses before 2026-10-01", () => {
    const result = parseBody(upsertScrumAttendanceSchema, body("2026-09-30", "late"));
    expect(result.success).toBe(true);
  });
});

describe("task PATCH clearing and reminder validation", () => {
  it("allows null to clear description and owner", () => {
    const result = parseBody(updateTaskSchema, { id: "t1", description: null, owner: null });
    expect(result.success).toBe(true);
  });

  it("accepts the ISO date-time the reminder picker sends, and yyyy-MM-dd", () => {
    for (const reminderAt of ["2026-10-09T09:00:00.000Z", "2026-10-09T09:00", "2026-10-09"]) {
      expect(parseBody(createTaskSchema, { title: "x", reminderAt }).success).toBe(true);
      expect(parseBody(updateTaskSchema, { id: "t1", reminderAt }).success).toBe(true);
    }
    expect(parseBody(updateTaskSchema, { id: "t1", reminderAt: null }).success).toBe(true);
  });

  it("rejects reminderAt that is not a real date", () => {
    for (const reminderAt of ["soon", "2026-13-45", "2026-10-09T99:99:00Z", ""]) {
      expect(parseBody(createTaskSchema, { title: "x", reminderAt }).success).toBe(false);
      expect(parseBody(updateTaskSchema, { id: "t1", reminderAt }).success).toBe(false);
    }
  });
});

describe("upsertScrumAttendanceSchema duplicates", () => {
  it("rejects the same member twice (case-insensitive) in one request", () => {
    const result = parseBody(upsertScrumAttendanceSchema, {
      date: "2026-10-02",
      entries: [
        { member: "Pranav", status: "on_time" },
        { member: " pranav ", status: "late" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("slackImportSchema permalink", () => {
  const withLink = (permalink?: string) => ({ matches: [{ text: "hi", permalink }] });

  it("accepts http(s), empty, and missing permalinks", () => {
    expect(parseBody(slackImportSchema, withLink("https://x.slack.com/archives/C1/p1")).success).toBe(true);
    expect(parseBody(slackImportSchema, withLink("http://x.slack.com/a")).success).toBe(true);
    expect(parseBody(slackImportSchema, withLink("")).success).toBe(true);
    expect(parseBody(slackImportSchema, withLink(undefined)).success).toBe(true);
  });

  it("rejects javascript: and other non-http(s) URLs", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,x", "not a url", "ftp://x.com/a"]) {
      expect(parseBody(slackImportSchema, withLink(link)).success).toBe(false);
    }
  });
});
