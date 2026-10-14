import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseCalendarSnapshot } from "@/lib/types";

const state = vi.hoisted(() => ({
  snapshot: null as ReleaseCalendarSnapshot | null,
  tokens: null as { email: string; accessToken: string; refreshToken: string; expiresAt: string } | null,
  rows: [] as unknown[][],
  sheetId: 1763731072,
  getError: null as unknown,
}));

const sheetsApi = vi.hoisted(() => ({
  get: vi.fn(),
  valuesGet: vi.fn(),
  // Any write call would show up here.
  writes: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        get: sheetsApi.get,
        batchUpdate: sheetsApi.writes,
        values: {
          get: sheetsApi.valuesGet,
          update: sheetsApi.writes,
          batchUpdate: sheetsApi.writes,
          append: sheetsApi.writes,
          clear: sheetsApi.writes,
        },
      },
    }),
  },
}));

vi.mock("@/lib/scrum-sheet", () => ({ getAuthorizedClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/scrum-sheet-store", () => ({ readScrumSheetTokens: vi.fn(async () => state.tokens) }));
vi.mock("@/lib/release-calendar-store", () => ({
  readReleaseCalendarSnapshot: vi.fn(async () => (state.snapshot ? structuredClone(state.snapshot) : null)),
  writeReleaseCalendarSnapshot: vi.fn(async (s: ReleaseCalendarSnapshot) => {
    state.snapshot = structuredClone(s);
  }),
}));

import { describeSyncError, syncReleaseCalendar, syncSkipReason } from "@/lib/release-calendar-sync";

const WEEK_42 = [
  ["Week 42", "Mon, October 12", "Tue, October 13", "Wed, October 14", "Thu, October 15", "Fri, October 16"],
  ["", "Release 1.204"],
];

function snapshot(overrides: Partial<ReleaseCalendarSnapshot> = {}): ReleaseCalendarSnapshot {
  return {
    spreadsheetId: "1r7M2HRio4Kg4dUIzPu_nkYqoO8N2rR5fqtnw8ehGQM8",
    sheetGid: 1763731072,
    sheetTitle: "Calendar",
    weeks: [],
    warnings: [],
    ...overrides,
  };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe("syncSkipReason", () => {
  const now = Date.parse("2026-10-14T10:00:00.000Z");
  const at = (m: number) => new Date(now - m * 60_000).toISOString();

  it("never skips without a snapshot", () => {
    expect(syncSkipReason(null, { force: false, nowMs: now })).toBeNull();
  });

  it("reuses a success under 5 minutes old unless forced", () => {
    const s = snapshot({ syncedAt: at(4), lastAttemptAt: at(4.1) });
    expect(syncSkipReason(s, { force: false, nowMs: now })).toBe("fresh");
    expect(syncSkipReason(s, { force: true, nowMs: now })).toBeNull();
    expect(syncSkipReason(snapshot({ syncedAt: at(6), lastAttemptAt: at(6) }), { force: false, nowMs: now })).toBeNull();
  });

  it("treats an unfinished attempt under 60s as in flight, even when forced", () => {
    const s = snapshot({ syncedAt: at(10), lastAttemptAt: at(0.5) });
    expect(syncSkipReason(s, { force: true, nowMs: now })).toBe("in_flight");
    expect(syncSkipReason(snapshot({ syncedAt: at(10), lastAttemptAt: at(2) }), { force: true, nowMs: now })).toBeNull();
  });

  it("lets Retry run right after a failure but backs off unforced calls for 60s", () => {
    const s = snapshot({ syncedAt: at(10), lastAttemptAt: at(0.5), lastError: "boom" });
    expect(syncSkipReason(s, { force: true, nowMs: now })).toBeNull();
    expect(syncSkipReason(s, { force: false, nowMs: now })).toBe("recent_attempt");
  });
});

describe("describeSyncError", () => {
  it("gives a generic view-access message for 403/404, without the account email", () => {
    expect(describeSyncError({ code: 403, message: "forbidden" })).toBe(
      "The connected Google account can't open Cryptogram 6 WP. Ask the sheet owner for view access."
    );
    expect(describeSyncError({ response: { status: 404 } })).toContain("Ask the sheet owner for view access");
  });

  it("returns a generic message for unknown errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(describeSyncError(new Error("socket hang up"))).toBe(
      "Couldn't sync the release calendar. Try again."
    );
  });
});

describe("syncReleaseCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.snapshot = null;
    state.tokens = { email: "me@x.com", accessToken: "at", refreshToken: "rt", expiresAt: minutesAgo(-60) };
    state.rows = WEEK_42;
    state.sheetId = 1763731072;
    sheetsApi.get.mockImplementation(async () => ({
      data: { sheets: [{ properties: { sheetId: 1, title: "Plan" } }, { properties: { sheetId: state.sheetId, title: "Cal 'x'" } }] },
    }));
    sheetsApi.valuesGet.mockImplementation(async () => ({ data: { values: state.rows } }));
  });

  it("reads the gid tab by title (read-only) and stores the parsed snapshot", async () => {
    const result = await syncReleaseCalendar();

    expect(result.synced).toBe(true);
    expect(sheetsApi.get).toHaveBeenCalledWith({
      spreadsheetId: "1r7M2HRio4Kg4dUIzPu_nkYqoO8N2rR5fqtnw8ehGQM8",
      fields: "sheets.properties",
    });
    expect(sheetsApi.valuesGet).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Cal ''x'''!A:Z", valueRenderOption: "FORMATTED_VALUE" })
    );
    expect(sheetsApi.writes).not.toHaveBeenCalled();
    expect(state.snapshot?.sheetTitle).toBe("Cal 'x'");
    expect(state.snapshot?.weeks[0].days[0].groups).toEqual([{ heading: "Release 1.204", items: [] }]);
    expect(state.snapshot?.syncedAt).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("rt");
  });

  it("does not call Google again within 5 minutes; force does", async () => {
    await syncReleaseCalendar();
    const again = await syncReleaseCalendar();
    expect(again.skipped).toBe("fresh");
    expect(sheetsApi.valuesGet).toHaveBeenCalledTimes(1);

    await syncReleaseCalendar({ force: true });
    expect(sheetsApi.valuesGet).toHaveBeenCalledTimes(2);
  });

  it("returns not connected without touching the snapshot", async () => {
    state.tokens = null;
    const result = await syncReleaseCalendar();
    expect(result.notConnected).toBe(true);
    expect(state.snapshot).toBeNull();
    expect(sheetsApi.get).not.toHaveBeenCalled();
  });

  it("keeps the previous weeks and syncedAt on failure and records the error", async () => {
    await syncReleaseCalendar();
    const before = structuredClone(state.snapshot!);
    sheetsApi.valuesGet.mockRejectedValueOnce({ code: 403 });

    const result = await syncReleaseCalendar({ force: true });

    expect(result.error).toBe("The connected Google account can't open Cryptogram 6 WP. Ask the sheet owner for view access.");
    expect(JSON.stringify(result)).not.toContain("me@x.com");
    expect(state.snapshot?.weeks).toEqual(before.weeks);
    expect(state.snapshot?.syncedAt).toBe(before.syncedAt);
    expect(state.snapshot?.lastError).toBe(result.error);
  });

  it("treats a read with no weeks as an error when weeks existed before", async () => {
    await syncReleaseCalendar();
    state.rows = [["nothing here"]];
    const result = await syncReleaseCalendar({ force: true });
    expect(result.error).toBe("Calendar tab returned no weeks");
    expect(state.snapshot?.weeks).toHaveLength(1);
  });

  it("reports a missing gid tab", async () => {
    state.sheetId = 42;
    const result = await syncReleaseCalendar();
    expect(result.error).toBe("Calendar tab not found in Cryptogram 6 WP.");
  });

  it("shares one in-process sync between concurrent callers", async () => {
    const [a, b] = await Promise.all([syncReleaseCalendar({ force: true }), syncReleaseCalendar({ force: true })]);
    expect(a).toBe(b);
    expect(sheetsApi.valuesGet).toHaveBeenCalledTimes(1);
  });
});
