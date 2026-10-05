import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailItem, SprintApproval } from "@/lib/types";

const listMock = vi.fn();
const getMock = vi.fn();
const updateStoreMock = vi.fn();
const readStoreMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    gmail: () => ({ users: { messages: { list: listMock, get: getMock } } }),
  },
}));

vi.mock("@/lib/gmail-store", () => ({
  readGmailTokens: vi.fn(async () => ({
    email: "me@example.com",
    accessToken: "a",
    refreshToken: "r",
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  })),
  writeGmailTokens: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({ updateStore: updateStoreMock, readStore: readStoreMock }));

import { INBOX_QUERY, buildApprovalThreadQuery, mergeGmailItems, syncGmailInbox } from "@/lib/gmail";

function mail(overrides: Partial<MailItem> & { id: string }): MailItem {
  return {
    subject: "s",
    from: "a@b.com",
    category: "other",
    summary: "",
    status: "unread",
    receivedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function gmailItem(gid: string, overrides: Partial<MailItem> = {}): MailItem {
  return mail({
    id: `gmail-${gid}`,
    gmailId: gid,
    source: "gmail",
    ...overrides,
  });
}

describe("mergeGmailItems", () => {
  it("drops support mail, including handled items from older syncs", () => {
    const oldSupport = gmailItem("s1", { subject: "[Support] Crash", status: "done" });
    const fresh = gmailItem("s2", { subject: "Hi", from: "support@vendor.com" });
    const keep = gmailItem("k", { subject: "Leave Notification" });
    const { mailItems } = mergeGmailItems([oldSupport], [fresh, keep]);
    expect(mailItems.map((m) => m.gmailId)).toEqual(["k"]);
  });

  it("keeps a handled item that fell outside the fetch window", () => {
    const old = gmailItem("old", { status: "drafted", followUpDate: "2026-10-10" });
    const { mailItems } = mergeGmailItems([old], [gmailItem("new")]);
    expect(mailItems.find((m) => m.gmailId === "old")).toEqual(old);
  });

  it("keeps stale items that are drafted/done or have a follow-up date, prunes the rest", () => {
    const done = gmailItem("done", { status: "done" });
    const drafted = gmailItem("drafted", { status: "drafted" });
    const followUp = gmailItem("fu", { followUpDate: "2026-10-05" });
    const untouched = gmailItem("untouched");
    // The sync labels every read message needs_reply, so it must not pin aged-out mail.
    const reply = gmailItem("reply", { status: "needs_reply" });
    const { mailItems } = mergeGmailItems([done, drafted, reply, followUp, untouched], []);
    expect(mailItems.map((m) => m.gmailId).sort()).toEqual(["done", "drafted", "fu"]);
  });

  it("keeps a needs_reply item that has a follow-up date", () => {
    const reply = gmailItem("reply", { status: "needs_reply", followUpDate: "2026-10-05" });
    const { mailItems } = mergeGmailItems([reply], []);
    expect(mailItems.map((m) => m.gmailId)).toEqual(["reply"]);
  });

  it("does not clobber user edits on a re-fetched item, but refreshes category", () => {
    const existing = gmailItem("a", {
      status: "drafted",
      category: "other",
      followUpDate: "2026-10-09",
    });
    const refetched = gmailItem("a", { status: "unread", category: "meeting", summary: "new" });
    const { mailItems, updated, added } = mergeGmailItems([existing], [refetched]);
    expect(updated).toBe(1);
    expect(added).toBe(0);
    expect(mailItems).toHaveLength(1);
    expect(mailItems[0]).toMatchObject({
      id: "gmail-a",
      status: "drafted",
      category: "meeting",
      followUpDate: "2026-10-09",
      summary: "new",
    });
  });

  it("uses the store passed in, so a concurrent change is preserved", () => {
    const snapshot = [gmailItem("a")];
    const fresh = [gmailItem("a", { status: "done", followUpDate: "2026-10-12" })];
    const fetched = [gmailItem("a")];
    const stale = mergeGmailItems(snapshot, fetched).mailItems[0];
    const result = mergeGmailItems(fresh, fetched).mailItems[0];
    expect(stale.status).toBe("unread");
    expect(result.status).toBe("done");
    expect(result.followUpDate).toBe("2026-10-12");
  });

  it("keeps manual items, including those added during the sync", () => {
    const manual = mail({ id: "m1", source: "manual" });
    const legacyManual = mail({ id: "m2" });
    const { mailItems } = mergeGmailItems([manual, legacyManual], [gmailItem("x")]);
    expect(mailItems.map((m) => m.id).sort()).toEqual(["gmail-x", "m1", "m2"]);
  });

  it("adds new items and sorts newest first", () => {
    const a = gmailItem("a", { receivedAt: "2026-09-01T00:00:00.000Z" });
    const b = gmailItem("b", { receivedAt: "2026-09-20T00:00:00.000Z" });
    const { mailItems, added } = mergeGmailItems([], [a, b]);
    expect(added).toBe(2);
    expect(mailItems.map((m) => m.gmailId)).toEqual(["b", "a"]);
  });
});

describe("syncGmailInbox", () => {
  beforeEach(() => {
    listMock.mockReset();
    getMock.mockReset();
    updateStoreMock.mockReset();
    readStoreMock.mockReset();
    readStoreMock.mockResolvedValue({ sprintApprovals: [] });
  });

  it("skips messages that fail to fetch and follows nextPageToken", async () => {
    listMock
      .mockResolvedValueOnce({
        data: { messages: [{ id: "1" }, { id: "2" }], nextPageToken: "p2" },
      })
      .mockResolvedValueOnce({ data: { messages: [{ id: "3" }] } });
    getMock.mockImplementation(async ({ id }: { id: string }) => {
      if (id === "2") throw new Error("boom");
      return { data: { snippet: `snip ${id}`, payload: { headers: [] } } };
    });

    let saved: { integrations: { gmail: { lastSyncError?: string } }; mailItems: MailItem[] } | undefined;
    updateStoreMock.mockImplementation(async (fn: (s: unknown) => typeof saved) => {
      saved = fn({ mailItems: [], integrations: {} });
    });

    const result = await syncGmailInbox();

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(listMock.mock.calls[1][0].pageToken).toBe("p2");
    expect(result).toMatchObject({ synced: 2, added: 2, failed: 1 });
    expect(saved?.mailItems.map((m) => m.gmailId).sort()).toEqual(["1", "3"]);
    expect(saved?.integrations.gmail.lastSyncError).toMatch(/1 message/);
  });

  const header = (subject: string, from: string) => ({
    payload: {
      headers: [
        { name: "Subject", value: subject },
        { name: "From", value: from },
      ],
    },
  });

  function approval(overrides: Partial<SprintApproval> & { id: string; title: string }): SprintApproval {
    return {
      approvals: { gm: false, dev: false, qa: false },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      ...overrides,
    };
  }

  type Saved = {
    mailItems: MailItem[];
    sprintApprovals: SprintApproval[];
    integrations: { gmail: { lastSyncError?: string } };
  };

  function captureSave(fresh: Omit<Saved, "integrations">) {
    const out: { saved?: Saved } = {};
    updateStoreMock.mockImplementation(async (fn: (s: unknown) => Saved) => {
      out.saved = fn({ ...fresh, integrations: {} });
    });
    return out;
  }

  it("ticks approvals from archived thread mail without adding it to mailItems", async () => {
    const pending = approval({ id: "a1", title: "Android Build 1.192" });
    readStoreMock.mockResolvedValue({ sprintApprovals: [pending] });
    listMock.mockImplementation(async ({ q }: { q: string }) =>
      q.startsWith("in:inbox")
        ? { data: { messages: [{ id: "in1" }] } }
        : { data: { messages: [{ id: "in1" }, { id: "t1" }] } }
    );
    getMock.mockImplementation(async ({ id }: { id: string }) => ({
      data:
        id === "t1"
          ? {
              ...header("Re: Android Build 1.192 Thread", "Amit <amitsrivastava@playsimple.in>"),
              snippet: "Approved",
              internalDate: String(Date.parse("2026-06-01T00:00:00.000Z")),
            }
          : { ...header("Hello", "x@y.com"), snippet: "hi" },
    }));
    const out = captureSave({ mailItems: [], sprintApprovals: [pending] });

    const result = await syncGmailInbox();

    expect(listMock.mock.calls[1][0].q).toBe(buildApprovalThreadQuery("Android Build 1.192"));
    // in1 was already fetched for the inbox, so only t1 is fetched again.
    expect(getMock.mock.calls.map((c) => c[0].id)).toEqual(["in1", "t1"]);
    expect(result.synced).toBe(1);
    expect(out.saved?.mailItems.map((m) => m.gmailId)).toEqual(["in1"]);
    expect(out.saved?.sprintApprovals[0]).toMatchObject({
      approvals: { gm: true, dev: false, qa: false },
      sentAt: "2026-06-01T00:00:00.000Z",
      autoSent: true,
    });
  });

  it("does not search threads for fully approved rows", async () => {
    const done = approval({
      id: "a1",
      title: "iOS Release 1.80",
      sentAt: "2026-09-01T00:00:00.000Z",
      approvals: { gm: true, dev: true, qa: true },
    });
    const overridden = approval({
      id: "a2",
      title: "Android Build 1.193",
      sentOverride: false,
      overrides: { gm: false, dev: false, qa: false },
    });
    readStoreMock.mockResolvedValue({ sprintApprovals: [done, overridden] });
    listMock.mockResolvedValue({ data: { messages: [] } });
    captureSave({ mailItems: [], sprintApprovals: [done, overridden] });

    await syncGmailInbox();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock.mock.calls[0][0].q).toBe(INBOX_QUERY);
  });

  it("does not fail the inbox sync when a thread search errors", async () => {
    const pending = approval({ id: "a1", title: "Android Build 1.192" });
    readStoreMock.mockResolvedValue({ sprintApprovals: [pending] });
    listMock.mockImplementation(async ({ q }: { q: string }) => {
      if (!q.startsWith("in:inbox")) throw new Error("quota");
      return { data: { messages: [{ id: "in1" }] } };
    });
    getMock.mockResolvedValue({ data: { ...header("Hello", "x@y.com"), snippet: "hi" } });
    const out = captureSave({ mailItems: [], sprintApprovals: [pending] });

    const result = await syncGmailInbox();

    expect(result).toMatchObject({ synced: 1, added: 1, failed: 0 });
    expect(out.saved?.mailItems.map((m) => m.gmailId)).toEqual(["in1"]);
    expect(out.saved?.sprintApprovals[0].approvals).toEqual({ gm: false, dev: false, qa: false });
    expect(out.saved?.integrations.gmail.lastSyncError).toMatch(/1 build thread search failed/);
  });
});

describe("buildApprovalThreadQuery", () => {
  it("searches all mail for the build thread subject", () => {
    expect(buildApprovalThreadQuery("Android Build 1.192")).toBe(
      'subject:"Android Build 1.192 Thread" newer_than:365d'
    );
    expect(buildApprovalThreadQuery("iOS Release 1.80")).not.toMatch(/in:inbox/);
  });

  it("strips quotes and backslashes so the phrase can't be broken", () => {
    expect(buildApprovalThreadQuery(' iOS "Release"\ 1.80 ')).toBe(
      'subject:"iOS Release 1.80 Thread" newer_than:365d'
    );
  });
});

describe("INBOX_QUERY", () => {
  it("excludes support senders", () => {
    expect(INBOX_QUERY).toContain("in:inbox newer_than:30d");
    expect(INBOX_QUERY).toContain("-from:support");
  });
});
