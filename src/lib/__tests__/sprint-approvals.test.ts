import { describe, expect, it } from "vitest";
import {
  addApprovalsFromMail,
  applyMailApprovals,
  needsMailCheck,
  syncSprintApprovals,
} from "@/lib/sprint-approvals";
import type { DashboardStore, MailItem, SprintApproval } from "@/lib/types";

const baseStore = (): DashboardStore => ({
  profile: { name: "Pranav", role: "Producer", company: "PSG" },
  tasks: [],
  releases: [
    {
      id: "rel-1180",
      name: "Android 1.180",
      platform: "android",
      targetDate: "2026-07-13",
      status: "in_dev",
      blockers: [],
      createdAt: "2026-07-08T12:00:00.000Z",
      updatedAt: "2026-07-08T12:00:00.000Z",
    },
  ],
  outings: [],
  slackItems: [],
  mailItems: [],
  sprintApprovals: [
    {
      id: "bad",
      title: "n",
      approvals: { gm: false, dev: false, qa: false },
      createdAt: "2026-07-08T11:00:00.000Z",
      updatedAt: "2026-07-08T11:00:00.000Z",
    },
  ],
  projectResources: [],
  plotBacklog: [],
  features: [],
  scrumMembers: [],
  scrumAttendance: [],
  scrumHolidays: [],
  lastUpdated: "2026-07-08T12:00:00.000Z",
});

describe("needsMailCheck", () => {
  const base: SprintApproval = {
    id: "a",
    title: "Android Build 1.192",
    approvals: { gm: true, dev: true, qa: true },
    sentAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  it("is false when everything is ticked and sent", () => {
    expect(needsMailCheck(base)).toBe(false);
  });

  it("is true when a party is unticked or sentAt is missing", () => {
    expect(needsMailCheck({ ...base, approvals: { ...base.approvals, qa: false } })).toBe(true);
    expect(needsMailCheck({ ...base, sentAt: undefined })).toBe(true);
  });

  it("ignores fields the user overrode", () => {
    expect(
      needsMailCheck({
        ...base,
        approvals: { ...base.approvals, qa: false },
        overrides: { qa: false },
        sentAt: undefined,
        sentOverride: false,
      })
    ).toBe(false);
  });
});

describe("addApprovalsFromMail", () => {
  const NOW = "2026-10-05T00:00:00.000Z";
  const mail = (id: string, subject: string, from: string, receivedAt: string): MailItem => ({
    id,
    source: "gmail",
    subject,
    from,
    category: "sprint",
    summary: "",
    status: "needs_reply",
    receivedAt,
  });
  const thread = [
    mail("m1", "Android Build 1.200 Thread", "pranavrishi@playsimple.in", "2026-09-20T00:00:00.000Z"),
    mail("m2", "Re: Android Build 1.200 Thread", "uttamk@playsimple.in", "2026-09-21T00:00:00.000Z"),
    mail("m3", "Re: iOS Release 1.82 Thread", "rohankarir@playsimple.in", "2026-09-26T00:00:00.000Z"),
  ];

  it("creates one mail row per new build thread", () => {
    const rows = addApprovalsFromMail([], thread, NOW);
    expect(rows).toEqual([
      {
        id: "sprint-approval-mail-android-1.200",
        title: "Android Build 1.200",
        platform: "android",
        source: "mail",
        approvals: { gm: false, dev: false, qa: false },
        createdAt: NOW,
        updatedAt: NOW,
      },
      expect.objectContaining({ id: "sprint-approval-mail-ios-1.82", title: "iOS Release 1.82" }),
    ]);
  });

  it("does not duplicate builds that already have a row and is idempotent", () => {
    const existing: SprintApproval = {
      id: "sprint-approval-rel-1200",
      releaseId: "rel-1200",
      title: "Android Build 1.200",
      platform: "android",
      approvals: { gm: false, dev: false, qa: false },
      createdAt: NOW,
      updatedAt: NOW,
    };
    const once = addApprovalsFromMail([existing], thread, NOW);
    expect(once.map((a) => a.id)).toEqual(["sprint-approval-mail-ios-1.82", existing.id]);
    expect(addApprovalsFromMail(once, thread, NOW)).toBe(once);
  });

  it("ignores build mail that is not a sprint thread", () => {
    const other = [
      mail("x1", "Android 1.204 release notes", "x@y.com", NOW),
      mail("x2", "Android Build 1.204 is live", "x@y.com", NOW),
    ];
    const none: SprintApproval[] = [];
    expect(addApprovalsFromMail(none, other, NOW)).toBe(none);
  });

  it("feeds applyMailApprovals: sentAt is the user's initiating mail", () => {
    const rows = applyMailApprovals(addApprovalsFromMail([], thread, NOW), thread, NOW);
    expect(rows.find((a) => a.platform === "android")).toMatchObject({
      sentAt: "2026-09-20T00:00:00.000Z",
      autoSent: true,
    });
  });

  it("is not tied to Planning: releases neither add nor prune rows", () => {
    const store = baseStore();
    store.sprintApprovals = addApprovalsFromMail([], thread, NOW);
    const ids = (s: DashboardStore) => s.sprintApprovals.map((a) => a.id).sort();
    const expected = ["sprint-approval-mail-android-1.200", "sprint-approval-mail-ios-1.82"];
    expect(ids(syncSprintApprovals(store))).toEqual(expected);
    expect(ids(syncSprintApprovals({ ...store, releases: [] }))).toEqual(expected);
  });
});

describe("skipped builds", () => {
  const skippedThread = [
    {
      id: "s",
      gmailId: "s",
      subject: "iOS Release 1.84 Thread",
      from: "pranavrishi@playsimple.in",
      summary: "Hey Team",
      status: "unread",
      category: "sprint",
      receivedAt: "2026-08-31T00:00:00.000Z",
      source: "gmail",
    },
  ] as MailItem[];

  it("never creates a row for iOS 1.84", () => {
    expect(addApprovalsFromMail([], skippedThread, "2026-10-05T00:00:00.000Z")).toEqual([]);
  });

  it("removes an existing iOS 1.84 row", () => {
    const row: SprintApproval = {
      id: "sprint-approval-mail-ios-1.84",
      title: "iOS Release 1.84",
      platform: "ios",
      source: "mail",
      approvals: { gm: false, dev: false, qa: false },
      createdAt: "2026-10-05T00:00:00.000Z",
      updatedAt: "2026-10-05T00:00:00.000Z",
    };
    const store = { ...baseStore(), sprintApprovals: [row] };
    expect(syncSprintApprovals(store).sprintApprovals).toEqual([]);
  });
});
