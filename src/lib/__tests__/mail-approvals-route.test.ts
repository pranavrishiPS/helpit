import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DashboardStore } from "@/lib/types";
import { applyMailApprovals } from "@/lib/sprint-approvals";

const stamp = "2026-10-01T00:00:00.000Z";

let current: DashboardStore;
vi.mock("@/lib/db", () => ({
  updateStore: async (fn: (s: DashboardStore) => DashboardStore) => {
    current = fn(current);
    return current;
  },
}));

import { PATCH } from "@/app/api/mail/approvals/route";

function req(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/mail/approvals", "http://localhost"), {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const amitMail = {
  id: "m1",
  subject: "Re: Android Build 1.192 Thread",
  from: "amitsrivastava@playsimple.in",
  summary: "Approved",
  category: "other" as const,
  status: "unread" as const,
  receivedAt: stamp,
};

beforeEach(() => {
  current = {
    profile: { name: "Alex", role: "Producer", company: "Test Co" },
    tasks: [],
    releases: [],
    outings: [],
    slackItems: [],
    mailItems: [amitMail],
    sprintApprovals: [
      {
        id: "a1",
        title: "Android Build 1.192",
        platform: "android",
        approvals: { gm: true, dev: false, qa: false },
        autoApproved: { gm: true },
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    projectResources: [],
    plotBacklog: [],
    features: [],
    scrumMembers: [],
    scrumAttendance: [],
    scrumHolidays: [],
    lastUpdated: stamp,
  };
});

describe("PATCH /api/mail/approvals overrides", () => {
  it("records an untick of an auto-detected party so mail can't re-tick it", async () => {
    const res = await PATCH(req({ id: "a1", party: "gm", approved: false }));
    expect(res.status).toBe(200);
    const item = current.sprintApprovals[0];
    expect(item.approvals.gm).toBe(false);
    expect(item.overrides).toEqual({ gm: false });
    expect(item.autoApproved).toBeUndefined();
    expect(applyMailApprovals(current.sprintApprovals, current.mailItems)[0].approvals.gm).toBe(false);
  });

  it("records a manual tick as an override", async () => {
    await PATCH(req({ id: "a1", party: "qa", approved: true }));
    const item = current.sprintApprovals[0];
    expect(item.approvals.qa).toBe(true);
    expect(item.overrides).toEqual({ qa: true });
    expect(item.autoApproved).toEqual({ gm: true });
  });

  it("404s for an unknown id", async () => {
    const res = await PATCH(req({ id: "nope", party: "gm", approved: true }));
    expect(res.status).toBe(404);
  });

  it("records a mail-sent override so the thread can't re-set sentAt", async () => {
    await PATCH(req({ id: "a1", mailSent: true }));
    expect(current.sprintApprovals[0].sentOverride).toBe(true);
    await PATCH(req({ id: "a1", mailSent: false }));
    const item = current.sprintApprovals[0];
    expect(item.sentAt).toBeUndefined();
    expect(item.sentOverride).toBe(false);
    expect(item.autoSent).toBeUndefined();
    expect(applyMailApprovals(current.sprintApprovals, current.mailItems)[0].sentAt).toBeUndefined();
  });
});
