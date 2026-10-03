import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFiles = vi.hoisted(() => new Map<string, string>());
// Real mutex, like the file-lock the store uses, so concurrent updates are serialized.
const lockTail = vi.hoisted(() => ({ current: Promise.resolve() as Promise<unknown> }));

vi.mock("@/lib/json-persist", () => ({
  withJsonLock: vi.fn(async (_filename: string, fn: () => Promise<unknown>) => {
    const run = lockTail.current.then(fn, fn);
    lockTail.current = run.catch(() => {});
    return run;
  }),
  readJsonText: vi.fn(async (filename: string) => mockFiles.get(filename) ?? null),
  writeJsonText: vi.fn(async (filename: string, content: string) => {
    mockFiles.set(filename, content);
  }),
  backupJson: vi.fn(async () => {}),
  deleteJson: vi.fn(async () => {}),
  usesBlobStore: vi.fn(() => false),
  jsonExists: vi.fn(async (filename: string) => mockFiles.has(filename)),
}));

import { importSlackMatches, parseMcpSlackSearchResults } from "@/lib/slack-import";
import { publicErrorMessage, UserFacingError } from "@/lib/errors";

function seedStore() {
  mockFiles.set(
    "store.json",
    JSON.stringify({
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
    })
  );
}

describe("parseMcpSlackSearchResults", () => {
  it("keeps a markdown rule inside the message", () => {
    const md = [
      "## Messages (2 results)",
      "### Result 1 of 2",
      "Channel: #team (ID: C1)",
      "From: A <a@x.in> (ID: U1)",
      "Message_ts: 1700000000.000100",
      "Text: ",
      "Please confirm the ETA",
      "",
      "---",
      "",
      "second part after the rule",
      "",
      "---",
      "",
      "### Result 2 of 2",
      "Channel: #team (ID: C1)",
      "From: A <a@x.in> (ID: U1)",
      "Message_ts: 1700000001.000100",
      "Text: ",
      "plain",
      "",
      "---",
    ].join("\r\n");
    const matches = parseMcpSlackSearchResults(md);
    expect(matches).toHaveLength(2);
    expect(matches[0].text).toBe("Please confirm the ETA\n\n---\n\nsecond part after the rule");
    expect(matches[1].text).toBe("plain");
  });
});

describe("importSlackMatches", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it("does not guess a user id and reports it", async () => {
    seedStore();
    const res = await importSlackMatches(
      [{ ts: "1.1", text: "<@U0AMXP1Q4RE> please confirm", channel: { id: "C1", name: "team" } }],
      {}
    );
    expect(res.userIdMissing).toBe(true);
    expect(res.userId).toBeUndefined();
    expect(res.addedSlack).toBe(0); // id-based mention detection is skipped
    expect(JSON.parse(mockFiles.get("store.json")!).integrations.slack.userId).toBeUndefined();
  });

  it("dedupes by channel + ts, not ts alone, and is idempotent", async () => {
    seedStore();
    const matches = [
      { ts: "1700000000.000100", text: "<@U1> please confirm", channel: { id: "C1", name: "alpha" } },
      { ts: "1700000000.000100", text: "<@U1> please confirm", channel: { id: "C2", name: "beta" } },
    ];
    const first = await importSlackMatches(matches, { userId: "U1" });
    expect(first.addedSlack).toBe(2);
    const second = await importSlackMatches(matches, { userId: "U1" });
    expect(second.addedSlack).toBe(0);
    const items = JSON.parse(mockFiles.get("store.json")!).slackItems;
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i: { id: string }) => i.id)).size).toBe(2);
  });

  it("dedupes inside the update, so concurrent imports of one message add it once", async () => {
    seedStore();
    const match = {
      ts: "1700000000.000100",
      text: "<@U1> please confirm",
      channel: { id: "C1", name: "alpha" },
    };
    const [a, b] = await Promise.all([
      importSlackMatches([match], { userId: "U1" }),
      importSlackMatches([match], { userId: "U1" }),
    ]);
    expect(a.addedSlack + b.addedSlack).toBe(1);
    expect(JSON.parse(mockFiles.get("store.json")!).slackItems).toHaveLength(1);
  });
});

describe("publicErrorMessage", () => {
  it("hides raw error detail but keeps user-facing messages", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      publicErrorMessage(new Error("invalid_grant: secret-token-abc"), "Gmail sync failed")
    ).toBe("Gmail sync failed");
    expect(spy).toHaveBeenCalled();
    expect(
      publicErrorMessage(new UserFacingError("Could not find a spreadsheet id in that URL."), "x")
    ).toBe("Could not find a spreadsheet id in that URL.");
    spy.mockRestore();
  });
});
