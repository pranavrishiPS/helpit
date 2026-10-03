import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = vi.hoisted(() => new Map<string, string>());

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
    lastUpdated: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  mockFiles.set("store.json", JSON.stringify(base));
}

describe("db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.clear();
  });

  it("creates and returns the default seed store when none exists", async () => {
    const store = await readStore();

    expect(store.profile.name).toBe("Pranav");
    expect(store.tasks.length).toBeGreaterThan(0);
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

  it("backs up and resets to defaults when store.json is corrupt, logging the error", async () => {
    mockFiles.set("store.json", "{not valid json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const store = await readStore();

    expect(store.profile.name).toBe("Pranav");
    expect(errorSpy).toHaveBeenCalled();

    const backupKeys = [...mockFiles.keys()].filter((k) => k.startsWith("store.corrupt-"));
    expect(backupKeys).toHaveLength(1);
    expect(mockFiles.get(backupKeys[0])).toBe("{not valid json");
  });

  it("logs when backing up a corrupt store fails, but still resets to defaults", async () => {
    mockFiles.set("store.json", "{not valid json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(jsonPersist.backupJson).mockRejectedValueOnce(new Error("disk full"));

    const store = await readStore();

    expect(store.profile.name).toBe("Pranav");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to back up"),
      expect.any(Error)
    );
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
});
