import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = vi.hoisted(() => new Map<string, string>());

vi.mock("@/lib/json-persist", () => ({
  withJsonLock: vi.fn(async (_filename: string, fn: () => Promise<unknown>) => fn()),
  readJsonText: vi.fn(async (filename: string) => mockFiles.get(filename) ?? null),
  writeJsonText: vi.fn(async (filename: string, content: string) => {
    mockFiles.set(filename, content);
  }),
  backupJson: vi.fn(async () => {}),
  deleteJson: vi.fn(async () => {}),
  usesBlobStore: vi.fn(() => false),
  jsonExists: vi.fn(async (filename: string) => mockFiles.has(filename)),
}));

import { importSlackMatches } from "@/lib/slack-import";

describe("importSlackMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.clear();
  });

  it("never deletes existing tasks, including Slack-sourced ones", async () => {
    const task = (id: string, extra: Record<string, unknown>) => ({
      id,
      title: id,
      status: "todo",
      priority: "medium",
      source: "manual",
      tags: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      ...extra,
    });
    mockFiles.set(
      "store.json",
      JSON.stringify({
        profile: { name: "Pranav", role: "Game Producer", company: "PlaySimple Games" },
        tasks: [
          task("manual-task", {}),
          task("slack-sourced", { source: "slack", status: "done" }),
          task("with-slack-ts", { slackTs: "1700000000.000100" }),
        ],
        releases: [],
        outings: [],
        slackItems: [],
        mailItems: [],
        sprintApprovals: [],
        projectResources: [],
        plotBacklog: [],
        features: [],
        lastUpdated: "2026-01-01T00:00:00.000Z",
      })
    );

    await importSlackMatches([], { userId: "U123" });

    const persisted = JSON.parse(mockFiles.get("store.json")!);
    expect(persisted.tasks.map((t: { id: string }) => t.id).sort()).toEqual([
      "manual-task",
      "slack-sourced",
      "with-slack-ts",
    ]);
    expect(persisted.integrations.slack.connected).toBe(true);
  });
});
