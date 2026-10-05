import { describe, expect, it } from "vitest";
import { applyMailApprovals, approvalKey, ownReplyText } from "@/lib/sprint-approvals";
import type { MailItem, SprintApproval } from "@/lib/types";

const stamp = "2026-10-01T00:00:00.000Z";
const now = "2026-10-05T00:00:00.000Z";

function approval(overrides: Partial<SprintApproval> = {}): SprintApproval {
  return {
    id: "a-1192",
    title: "Android Build 1.192",
    platform: "android",
    sentAt: stamp,
    approvals: { gm: false, dev: false, qa: false },
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

function mail(id: string, from: string, summary: string, subject = "Re: Android Build 1.192 Thread"): MailItem {
  return {
    id,
    subject,
    from,
    summary,
    category: "other",
    status: "unread",
    receivedAt: stamp,
    source: "gmail",
  };
}

const amit = mail(
  "m-amit",
  "Amit Srivastava <AmitSrivastava@playsimple.in>",
  "Approved On Thu, Oct 1, 2026 at 2:26 PM Ayush Upadhyay &lt;ayushupadhyay@playsimple.in&gt; wrote: Hey Team, Dev Costing:- Priority Feature"
);
const ayush = mail(
  "m-ayush",
  "Ayush Upadhyay <ayushupadhyay@playsimple.in>",
  "Hey Team, Dev Costing:- Priority Feature ..."
);
const manvi = mail(
  "m-manvi",
  "Manvi Thakur <manvithakur@playsimple.in>",
  "Hey Team, Please find below the feature-wise costing from the QA side..."
);

describe("approvalKey", () => {
  it("matches mail subjects to approval titles", () => {
    expect(approvalKey("Re: Android Build 1.192 Thread")).toBe("android:1.192");
    expect(approvalKey("Re: iOS Release 1.80 Thread")).toBe("ios:1.80");
    expect(approvalKey("iOS Release 1.80", "ios")).toBe("ios:1.80");
  });
});

describe("ownReplyText", () => {
  it("drops the quoted On ... wrote: part and decodes entities", () => {
    expect(ownReplyText(amit.summary).trim()).toBe("Approved");
  });
});

describe("applyMailApprovals", () => {
  it("ticks gm when Amit replies Approved", () => {
    const [result] = applyMailApprovals([approval()], [amit], now);
    expect(result.approvals).toEqual({ gm: true, dev: false, qa: false });
    expect(result.autoApproved).toEqual({ gm: true });
    expect(result.updatedAt).toBe(now);
  });

  it("ticks dev when Ayush shares costing", () => {
    const [result] = applyMailApprovals([approval()], [ayush], now);
    expect(result.approvals).toEqual({ gm: false, dev: true, qa: false });
  });

  it("ticks qa when Manvi shares costing", () => {
    const [result] = applyMailApprovals([approval()], [manvi], now);
    expect(result.approvals).toEqual({ gm: false, dev: false, qa: true });
  });

  it("does not tick dev from costing quoted inside Amit's reply", () => {
    const quotedOnly = mail(
      "m-uttam",
      "uttamk@playsimple.in",
      "Thanks On Thu, Oct 1, 2026 at 2:26 PM Ayush Upadhyay &lt;ayushupadhyay@playsimple.in&gt; wrote: Dev Costing:-"
    );
    const [result] = applyMailApprovals([approval()], [amit, quotedOnly], now);
    expect(result.approvals.dev).toBe(false);
  });

  it("ignores mail for a different build or platform", () => {
    const other = [
      mail("x1", ayush.from, ayush.summary, "Re: Android Build 1.193 Thread"),
      mail("x2", ayush.from, ayush.summary, "Re: iOS Release 1.192 Thread"),
      mail("x3", ayush.from, ayush.summary, "Sprint costing"),
    ];
    const input = [approval()];
    expect(applyMailApprovals(input, other, now)).toBe(input);
  });

  it("ignores senders outside the approver list", () => {
    const input = [approval()];
    const stranger = mail("s", "someone@playsimple.in", "Approved");
    expect(applyMailApprovals(input, [stranger], now)).toBe(input);
  });

  it("respects user overrides", () => {
    const input = [approval({ overrides: { gm: false } })];
    expect(applyMailApprovals(input, [amit], now)).toBe(input);
  });

  it("never un-ticks", () => {
    const input = [approval({ approvals: { gm: true, dev: true, qa: false } })];
    const [result] = applyMailApprovals(input, [], now);
    expect(result.approvals).toEqual({ gm: true, dev: true, qa: false });
  });

  it("is idempotent", () => {
    const once = applyMailApprovals([approval()], [amit, ayush, manvi], now);
    expect(once[0].approvals).toEqual({ gm: true, dev: true, qa: true });
    expect(applyMailApprovals(once, [amit, ayush, manvi], now)).toBe(once);
  });

  it.each([
    "Not approved yet, please revisit QA effort",
    "This is unapproved for now",
    "I can’t approve this, approved scope is too big",
    "Cannot approve until costing is final",
    "We don't approve the extra items; approved list stays",
    "Approved? No, not approved",
  ])("does not count negated approval: %s", (text) => {
    const input = [approval()];
    expect(applyMailApprovals(input, [mail("n", amit.from, text)], now)).toBe(input);
  });

  it("auto-sets sentAt from the earliest mail on the build thread", () => {
    const later = { ...ayush, receivedAt: "2026-10-03T00:00:00.000Z" };
    const earlier = { ...mail("m0", "someone@playsimple.in", "Hi"), receivedAt: "2026-09-30T10:00:00.000Z" };
    const [result] = applyMailApprovals([approval({ sentAt: undefined })], [later, earlier], now);
    expect(result.sentAt).toBe("2026-09-30T10:00:00.000Z");
    expect(result.autoSent).toBe(true);
    expect(result.approvals.dev).toBe(true);
  });

  it("does not auto-set sentAt without a matching thread", () => {
    const input = [approval({ sentAt: undefined })];
    const other = mail("o", ayush.from, "Hi", "Re: Android Build 1.193 Thread");
    expect(applyMailApprovals(input, [other], now)).toBe(input);
  });

  it("respects a manual mail-sent override", () => {
    const input = [approval({ sentAt: undefined, sentOverride: false })];
    const plain = mail("p", "someone@playsimple.in", "Hi");
    expect(applyMailApprovals(input, [plain], now)).toBe(input);
  });

  it("is idempotent after auto-setting sentAt", () => {
    const mails = [mail("p", "someone@playsimple.in", "Hi")];
    const once = applyMailApprovals([approval({ sentAt: undefined })], mails, now);
    expect(once[0].sentAt).toBe(stamp);
    expect(applyMailApprovals(once, mails, now)).toBe(once);
  });
});
