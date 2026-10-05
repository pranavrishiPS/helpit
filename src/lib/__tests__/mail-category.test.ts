import { describe, expect, it } from "vitest";
import {
  MAIL_CATEGORIES,
  mailThreadKey,
  categorizeMail,
  formatMailTime,
  mailSenderLabel,
  resolveMailCategory,
} from "@/lib/mail-category";

describe("categorizeMail", () => {
  it("detects Google Calendar invites and responses as meetings", () => {
    expect(categorizeMail("Invitation: Sprint review @ Mon", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Updated invitation: Sync", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Accepted: Planning", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Declined: Planning", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Tentatively accepted: Planning", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Canceled event: Retro", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Cancelled event: Retro", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Anything", "calendar-notification@google.com")).toBe("meeting");
  });

  it("detects meeting keywords in the subject", () => {
    expect(categorizeMail("Quick MEETING tomorrow", "a@b.com")).toBe("meeting");
    expect(categorizeMail("1:1 notes", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Daily standup moved", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Catch up on art pipeline", "a@b.com")).toBe("meeting");
  });

  it("detects leave / WFH mail", () => {
    expect(categorizeMail("Leave request - Friday", "a@b.com")).toBe("leave");
    expect(categorizeMail("Leaves for October", "a@b.com")).toBe("leave");
    expect(categorizeMail("WFH today", "a@b.com")).toBe("leave");
    expect(categorizeMail("Work From Home on Friday", "a@b.com")).toBe("leave");
    expect(categorizeMail("OOO until Monday", "a@b.com")).toBe("leave");
    expect(categorizeMail("Half-day on Thursday", "a@b.com")).toBe("leave");
    expect(categorizeMail("Comp off for weekend release", "a@b.com")).toBe("leave");
    expect(categorizeMail("Holiday request for 24 Dec", "a@b.com")).toBe("leave");
  });

  it("does not treat words containing 'leave' as leave", () => {
    expect(categorizeMail("Leaderboard update", "a@b.com")).toBe("other");
  });

  it("detects support mail", () => {
    expect(categorizeMail("[Support] Crash on level 12", "a@b.com")).toBe("support");
    expect(categorizeMail("New ticket #4411", "a@b.com")).toBe("support");
    expect(categorizeMail("Player issue: lost coins", "a@b.com")).toBe("support");
    expect(categorizeMail("Hello", "support@playsimple.in")).toBe("support");
    expect(categorizeMail("Hello", "noreply@zendesk.com")).toBe("support");
  });

  it("checks meeting before leave before support", () => {
    expect(categorizeMail("Invitation: Leave policy meeting", "a@b.com")).toBe("meeting");
    expect(categorizeMail("Sick leave ticket", "a@b.com")).toBe("leave");
  });

  it("falls back to other", () => {
    expect(categorizeMail("Weekly newsletter", "news@b.com")).toBe("other");
  });
});

describe("resolveMailCategory", () => {
  it("recomputes from subject even when a category is stored", () => {
    expect(resolveMailCategory({ subject: "WFH", from: "a@b.com", category: "other" })).toBe("leave");
  });

  it("re-categorises legacy internal/vendor items", () => {
    expect(resolveMailCategory({ subject: "WFH today", from: "a@b.com", category: "internal" })).toBe(
      "leave"
    );
    expect(resolveMailCategory({ subject: "Quote", from: "vendor@x.com", category: "vendor" })).toBe(
      "other"
    );
  });

  it("covers every category id", () => {
    expect(MAIL_CATEGORIES.map((c) => c.id)).toEqual(["support", "leave", "meeting", "other"]);
  });
});

describe("mailSenderLabel", () => {
  it("uses the display name when present, else the local-part", () => {
    expect(mailSenderLabel('"Asha K" <asha@playsimple.in>')).toBe("Asha K");
    expect(mailSenderLabel("asha@playsimple.in")).toBe("asha");
    expect(mailSenderLabel("unknown")).toBe("unknown");
  });
});

describe("formatMailTime", () => {
  const now = new Date(2026, 9, 5, 15, 0); // Mon 5 Oct 2026, local time
  it("shows HH:mm for today", () => {
    expect(formatMailTime(new Date(2026, 9, 5, 10, 42).toISOString(), now)).toBe("10:42");
  });
  it("shows weekday within the last week", () => {
    expect(formatMailTime(new Date(2026, 9, 2, 9, 0).toISOString(), now)).toBe("Fri");
  });
  it("shows day + month for older mail", () => {
    expect(formatMailTime(new Date(2026, 8, 3, 9, 0).toISOString(), now)).toBe("3 Sep");
    expect(formatMailTime(new Date(2025, 9, 3, 9, 0).toISOString(), now)).toBe("3 Oct 2025");
  });
  it("returns empty for invalid dates", () => {
    expect(formatMailTime("nope", now)).toBe("");
  });
});

describe("mailThreadKey", () => {
  it("ignores Re:/Fwd: prefixes, case and spacing", () => {
    expect(mailThreadKey("Re: RE: Fwd:  Android Build 1.190 Thread")).toBe("android build 1.190 thread");
    expect(mailThreadKey("Earned Leave Notification of  Uttam")).toBe(mailThreadKey("earned leave notification of uttam"));
  });
});

describe("meeting proposals", () => {
  it("treats 'Proposed new time' as a meeting", () => {
    expect(categorizeMail("Proposed new time: Planning @ Tue", "a@b.com")).toBe("meeting");
  });
});
