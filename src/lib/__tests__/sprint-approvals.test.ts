import { describe, expect, it } from "vitest";
import { needsMailCheck, syncSprintApprovalsFromReleases } from "@/lib/sprint-approvals";
import type { DashboardStore, SprintApproval } from "@/lib/types";

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

describe("syncSprintApprovalsFromReleases", () => {
  it("removes junk rows and adds approvals for planning releases", () => {
    const result = syncSprintApprovalsFromReleases(baseStore());
    expect(result.sprintApprovals.some((a) => a.title === "n")).toBe(false);
    expect(result.sprintApprovals.some((a) => a.title === "Android Build 1.180")).toBe(true);
    expect(
      result.sprintApprovals.find((a) => a.title === "Android Build 1.180")?.releaseId
    ).toBe("rel-1180");
  });

  it("does not duplicate when release already has an approval", () => {
    const store = baseStore();
    const synced = syncSprintApprovalsFromReleases(store);
    const again = syncSprintApprovalsFromReleases(synced);
    expect(again).toBe(synced);
  });

  it("prunes approvals linked to missing releases", () => {
    const store = baseStore();
    store.sprintApprovals.push({
      id: "orphan",
      title: "Android Build 1.178",
      platform: "android",
      releaseId: "rel-android-1178",
      approvals: { gm: false, dev: false, qa: false },
      createdAt: "2026-07-08T11:00:00.000Z",
      updatedAt: "2026-07-08T11:00:00.000Z",
    });

    const result = syncSprintApprovalsFromReleases(store);
    expect(result.sprintApprovals.some((a) => a.id === "orphan")).toBe(false);
  });
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
