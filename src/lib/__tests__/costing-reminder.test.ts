import { describe, expect, it } from "vitest";
import { buildCostingReminder } from "@/lib/costing-reminder";
import type { SprintApproval } from "@/lib/types";

const AMIT = "@Amit";
const AYUSH = "@Ayush";
const ROHAN = "@Rohan";
const MANVI = "@Manvi";
const HEADER = "Hi team, gentle reminder on the sprint costing threads — pending from you:";

function approval(
  title: string,
  platform: "android" | "ios",
  approvals: Partial<SprintApproval["approvals"]> = {},
  sentAt: string | null = "2026-10-01T10:00:00.000Z"
): SprintApproval {
  return {
    id: `a-${title}`,
    title,
    platform,
    source: "mail",
    approvals: { gm: false, dev: false, qa: false, ...approvals },
    sentAt: sentAt ?? undefined,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };
}

describe("buildCostingReminder", () => {
  it("returns an empty string when nothing is pending", () => {
    expect(buildCostingReminder([])).toBe("");
    expect(
      buildCostingReminder([
        approval("Android Build 1.202", "android", { gm: true, dev: true, qa: true }),
      ])
    ).toBe("");
  });

  it("groups builds per column owner, newest first, tagging both QAs", () => {
    const message = buildCostingReminder([
      approval("iOS Release 1.86", "ios", { gm: true }),
      approval("Android Build 1.202", "android"),
      approval("Android Build 1.200", "android", { gm: true, dev: true }),
    ]);
    expect(message).toBe(
      [
        HEADER,
        `• ${AMIT} — Android Build 1.202`,
        `• ${AYUSH} — Android Build 1.202, iOS Release 1.86`,
        `• ${ROHAN}, ${MANVI} — Android Build 1.202, Android Build 1.200, iOS Release 1.86`,
      ].join("\n")
    );
  });

  it("omits people who have approved everything", () => {
    const message = buildCostingReminder([
      approval("Android Build 1.196", "android", { gm: true, dev: true }),
    ]);
    expect(message).toContain(`• ${ROHAN}, ${MANVI} — Android Build 1.196`);
    expect(message).not.toContain(AMIT);
    expect(message).not.toContain(AYUSH);
  });

  it("skips fully approved builds", () => {
    const message = buildCostingReminder([
      approval("Android Build 1.192", "android", { gm: true, dev: true, qa: true }),
      approval("iOS Release 1.86", "ios", { gm: true, dev: true }),
    ]);
    expect(message).not.toContain("1.192");
    expect(message).toContain("iOS Release 1.86");
  });

  it("skips builds whose mail has not been sent", () => {
    expect(
      buildCostingReminder([approval("Android Build 1.204", "android", {}, null)])
    ).toBe("");
  });

  it("does not mutate the input order", () => {
    const items = [approval("iOS Release 1.86", "ios"), approval("Android Build 1.202", "android")];
    buildCostingReminder(items);
    expect(items.map((i) => i.title)).toEqual(["iOS Release 1.86", "Android Build 1.202"]);
  });
});
