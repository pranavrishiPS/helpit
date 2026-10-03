import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = vi.hoisted(() => new Map<string, string>());
const mockEtags = vi.hoisted(() => new Map<string, number>());

vi.mock("@/lib/json-persist", () => ({
  withJsonLock: vi.fn(async (_filename: string, fn: () => Promise<unknown>) => fn()),
  readJsonText: vi.fn(async (filename: string) => mockFiles.get(filename) ?? null),
  writeJsonText: vi.fn(async (filename: string, content: string) => {
    mockFiles.set(filename, content);
  }),
  backupJson: vi.fn(async (filename: string, backupFilename: string) => {
    const raw = mockFiles.get(filename);
    if (raw == null) return;
    mockFiles.set(backupFilename, raw);
  }),
  deleteJson: vi.fn(async (filename: string) => {
    mockFiles.delete(filename);
  }),
  usesBlobStore: vi.fn(() => false),
  jsonExists: vi.fn(async (filename: string) => mockFiles.has(filename)),
  // Blob-mode primitives: the etag is a version counter kept in mockEtags.
  readJsonTextWithEtag: vi.fn(async (filename: string) => ({
    text: mockFiles.get(filename) ?? null,
    etag: mockFiles.has(filename) ? String(mockEtags.get(filename) ?? 0) : null,
  })),
  writeJsonTextIfMatch: vi.fn(async (filename: string, content: string, etag: string | null) => {
    const current = mockFiles.has(filename) ? String(mockEtags.get(filename) ?? 0) : null;
    if (current !== etag) return false;
    mockFiles.set(filename, content);
    mockEtags.set(filename, (mockEtags.get(filename) ?? 0) + 1);
    return true;
  }),
}));

import * as jsonPersist from "@/lib/json-persist";
import { readStore, updateStore } from "@/lib/db";

function seedStore(overrides: Record<string, unknown> = {}) {
  const base = {
    profile: { name: "Pranav", role: "Game Producer", company: "PlaySimple Games" },
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
    lastUpdated: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  mockFiles.set("store.json", JSON.stringify(base));
}

describe("db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.clear();
    mockEtags.clear();
  });

  it("creates and returns an EMPTY default store (no dummy data) when none exists", async () => {
    const store = await readStore();

    expect(store.profile.name).toBe("Pranav");
    expect(store.tasks).toEqual([]);
    expect(store.releases).toEqual([]);
    expect(store.outings).toEqual([]);
    expect(store.slackItems).toEqual([]);
    expect(store.mailItems).toEqual([]);
    expect(mockFiles.has("store.json")).toBe(true);
  });

  it("refuses to seed defaults over a store that exists but reads as empty", async () => {
    mockFiles.set("store.json", "");
    // Real readJsonText reports an empty file as null
    vi.mocked(jsonPersist.readJsonText).mockResolvedValueOnce(null);

    await expect(readStore()).rejects.toThrow(/refusing to overwrite/);
    expect(mockFiles.get("store.json")).toBe("");
  });

  it("rejects without touching the file when a local read throws a transient error", async () => {
    seedStore();
    const before = mockFiles.get("store.json");
    const busy = Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    vi.mocked(jsonPersist.readJsonText).mockRejectedValueOnce(busy);

    await expect(readStore()).rejects.toThrow(/EBUSY/);
    expect(mockFiles.get("store.json")).toBe(before);
    expect(jsonPersist.writeJsonText).not.toHaveBeenCalled();
  });

  it("migrates legacy reminders into tasks and drops the reminders array", async () => {
    seedStore({
      reminders: [
        {
          id: "rem-1",
          title: "Ping QA",
          remindAt: "2026-07-01T10:00:00.000Z",
          completed: false,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const store = await readStore();
    const migratedTask = store.tasks.find((t) => t.id === "rem-1");

    expect(migratedTask).toBeDefined();
    expect(migratedTask?.dueDate).toBe("2026-07-01");
    expect(migratedTask?.status).toBe("todo");

    const persisted = JSON.parse(mockFiles.get("store.json")!);
    expect(persisted.reminders).toBeUndefined();
  });

  it("removes attendance entries that sit on a holiday date, and persists the cleanup", async () => {
    const entry = (member: string, date: string) => ({
      id: `${member}-${date}`,
      date,
      member,
      status: "on_time",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    seedStore({
      scrumMembers: ["Pranav", "Vrushali"],
      scrumHolidays: [{ date: "2026-10-02", label: "Holiday" }],
      scrumAttendance: [
        entry("Pranav", "2026-10-02"),
        entry("Vrushali", "2026-10-02"),
        entry("Pranav", "2026-10-01"),
      ],
    });

    const store = await readStore();
    expect(store.scrumAttendance.map((e) => `${e.member}@${e.date}`)).toEqual(["Pranav@2026-10-01"]);

    const persisted = JSON.parse(mockFiles.get("store.json")!);
    expect(persisted.scrumAttendance).toHaveLength(1);
  });

  it("normalizes legacy numeric release ids and remaps linked sprint approvals", async () => {
    seedStore({
      releases: [
        {
          id: "rel-1180",
          name: "Android 1.180",
          status: "in_dev",
          blockers: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      sprintApprovals: [
        {
          id: "sprint-approval-rel-1180",
          releaseId: "rel-1180",
          title: "Android 1.180",
          approvals: { gm: false, dev: false, qa: false },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const store = await readStore();

    expect(store.releases[0].id).toBe("rel-android-1180");
    const approval = store.sprintApprovals.find((a) => a.releaseId === "rel-android-1180");
    expect(approval).toBeDefined();
    expect(approval?.id).toBe("sprint-approval-rel-android-1180");
  });

  it("backs up and resets to an empty store when store.json is corrupt, logging the error", async () => {
    mockFiles.set("store.json", "{not valid json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const store = await readStore();

    expect(store.profile.name).toBe("Pranav");
    expect(errorSpy).toHaveBeenCalled();

    const backupKeys = [...mockFiles.keys()].filter((k) => k.startsWith("store.corrupt-"));
    expect(backupKeys).toHaveLength(1);
    expect(mockFiles.get(backupKeys[0])).toBe("{not valid json");
  });

  it("aborts without overwriting store.json when backing up a corrupt store fails", async () => {
    mockFiles.set("store.json", "{not valid json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(jsonPersist.backupJson).mockRejectedValueOnce(new Error("disk full"));

    await expect(readStore()).rejects.toThrow(/could not be backed up/);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to back up"),
      expect.any(Error)
    );
    expect(mockFiles.get("store.json")).toBe("{not valid json");
    expect(jsonPersist.writeJsonText).not.toHaveBeenCalled();
  });

  it("updateStore skips the write and keeps lastUpdated when the updater returns the same store (404-style no-op)", async () => {
    seedStore();
    const before = mockFiles.get("store.json");

    const result = await updateStore((s) => s);

    expect(result.lastUpdated).toBe("2026-01-01T00:00:00.000Z");
    expect(jsonPersist.writeJsonText).not.toHaveBeenCalled();
    expect(mockFiles.get("store.json")).toBe(before);
  });

  it("updateStore persists the updater result and re-syncs sprint approvals", async () => {
    seedStore({
      releases: [
        {
          id: "rel-android-1180",
          name: "Android 1.180",
          status: "in_dev",
          blockers: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const updated = await updateStore((s) => ({
      ...s,
      profile: { ...s.profile, name: "Alex" },
    }));

    expect(updated.profile.name).toBe("Alex");
    expect(updated.sprintApprovals.some((a) => a.releaseId === "rel-android-1180")).toBe(true);

    const persisted = JSON.parse(mockFiles.get("store.json")!);
    expect(persisted.profile.name).toBe("Alex");
  });

  describe("updateStore in Blob mode (optimistic concurrency)", () => {
    beforeEach(() => {
      vi.mocked(jsonPersist.usesBlobStore).mockReturnValue(true);
    });
    afterEach(() => {
      vi.mocked(jsonPersist.usesBlobStore).mockReturnValue(false);
      vi.restoreAllMocks();
    });

    it("writes with the etag it read and does not use the local lock", async () => {
      seedStore();
      const updated = await updateStore((s) => ({ ...s, profile: { ...s.profile, name: "Alex" } }));

      expect(updated.profile.name).toBe("Alex");
      expect(jsonPersist.writeJsonTextIfMatch).toHaveBeenCalledWith("store.json", expect.any(String), "0");
      expect(jsonPersist.withJsonLock).not.toHaveBeenCalled();
      expect(JSON.parse(mockFiles.get("store.json")!).profile.name).toBe("Alex");
    });

    it("on a lost race re-reads fresh data and re-applies the updater (no lost update)", async () => {
      seedStore({ tasks: [] });
      const task = (id: string) => ({
        id,
        title: id,
        status: "todo",
        priority: "medium",
        source: "manual",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      // A concurrent writer lands its change just before our first write.
      vi.mocked(jsonPersist.writeJsonTextIfMatch).mockImplementationOnce(async () => {
        const other = JSON.parse(mockFiles.get("store.json")!);
        other.tasks.push(task("other"));
        mockFiles.set("store.json", JSON.stringify(other));
        mockEtags.set("store.json", 1);
        return false;
      });
      const updater = vi.fn((s: Awaited<ReturnType<typeof readStore>>) => ({
        ...s,
        tasks: [...s.tasks, task("mine") as (typeof s.tasks)[number]],
      }));

      await updateStore(updater);

      expect(updater).toHaveBeenCalledTimes(2);
      expect(updater.mock.calls[1][0].tasks.map((t) => t.id)).toEqual(["other"]);
      const persisted = JSON.parse(mockFiles.get("store.json")!);
      expect(persisted.tasks.map((t: { id: string }) => t.id)).toEqual(["other", "mine"]);
    });

    it("gives up with a clear error after the attempt cap", async () => {
      seedStore();
      vi.spyOn(Math, "random").mockReturnValue(0);
      for (let i = 0; i < 8; i++) {
        vi.mocked(jsonPersist.writeJsonTextIfMatch).mockResolvedValueOnce(false);
      }

      await expect(
        updateStore((s) => ({ ...s, profile: { ...s.profile, name: "Alex" } }))
      ).rejects.toThrow(/after 8 attempts.*concurrently/);
      expect(jsonPersist.writeJsonTextIfMatch).toHaveBeenCalledTimes(8);
    });

    it("creates the store on first write (no blob yet, null etag)", async () => {
      const updated = await updateStore((s) => ({ ...s, profile: { ...s.profile, name: "Alex" } }));

      expect(updated.profile.name).toBe("Alex");
      expect(jsonPersist.writeJsonTextIfMatch).toHaveBeenCalledWith("store.json", expect.any(String), null);
      expect(JSON.parse(mockFiles.get("store.json")!).profile.name).toBe("Alex");
    });

    it("refuses to overwrite a store that exists but reads as empty", async () => {
      mockFiles.set("store.json", "");
      vi.mocked(jsonPersist.readJsonTextWithEtag).mockResolvedValueOnce({ text: null, etag: "0" });

      await expect(updateStore((s) => s)).rejects.toThrow(/refusing to overwrite/);
      expect(jsonPersist.writeJsonTextIfMatch).not.toHaveBeenCalled();
      expect(mockFiles.get("store.json")).toBe("");
    });

    it("readStore never persists in Blob mode, even when migrations are pending", async () => {
      seedStore({
        reminders: [
          {
            id: "rem-1",
            title: "Ping QA",
            remindAt: "2026-07-01T10:00:00.000Z",
            completed: false,
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      });
      const before = mockFiles.get("store.json");

      const store = await readStore();

      expect(store.tasks.some((t) => t.id === "rem-1")).toBe(true);
      expect(jsonPersist.writeJsonText).not.toHaveBeenCalled();
      expect(jsonPersist.writeJsonTextIfMatch).not.toHaveBeenCalled();
      expect(mockFiles.get("store.json")).toBe(before);
    });

    it("readStore returns an in-memory empty store without writing when no blob exists", async () => {
      const store = await readStore();

      expect(store.tasks).toEqual([]);
      expect(jsonPersist.writeJsonText).not.toHaveBeenCalled();
      expect(jsonPersist.writeJsonTextIfMatch).not.toHaveBeenCalled();
      expect(mockFiles.has("store.json")).toBe(false);
    });

    it("throws instead of resetting a corrupt store (read and update)", async () => {
      mockFiles.set("store.json", "{not valid json");

      await expect(readStore()).rejects.toThrow(/corrupt/);
      await expect(updateStore((s) => s)).rejects.toThrow(/corrupt/);

      expect(mockFiles.get("store.json")).toBe("{not valid json");
      expect(jsonPersist.writeJsonText).not.toHaveBeenCalled();
      expect(jsonPersist.writeJsonTextIfMatch).not.toHaveBeenCalled();
      expect(jsonPersist.backupJson).not.toHaveBeenCalled();
    });

    it("skips the conditional write on a no-op update and leaves lastUpdated untouched", async () => {
      seedStore();

      const result = await updateStore((s) => s);

      expect(result.lastUpdated).toBe("2026-01-01T00:00:00.000Z");
      expect(jsonPersist.writeJsonTextIfMatch).not.toHaveBeenCalled();
    });
  });
});
