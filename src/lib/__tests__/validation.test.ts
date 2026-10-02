import { describe, expect, it } from "vitest";
import {
  createOutingExpenseSchema,
  createTaskSchema,
  parseBody,
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
