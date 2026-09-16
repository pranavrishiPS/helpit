import { describe, expect, it } from "vitest";
import { parseSlackMatch } from "@/lib/slack";

describe("parseSlackMatch", () => {
  it("detects follow-ups mentioning profile name", () => {
    const result = parseSlackMatch(
      {
        ts: "123.456",
        text: "Hey Alex, please share ETA for the build",
        channel: { name: "live-ops" },
      },
      "U123",
      "Alex"
    );
    expect(result?.slackItem.summary).toContain("ETA");
    expect(result?.slackItem.action).toBe("reply");
  });

  it("ignores noise without action keywords", () => {
    const result = parseSlackMatch(
      {
        ts: "123.456",
        text: "Alex had lunch today",
        channel: { name: "random" },
      },
      "U123",
      "Alex"
    );
    expect(result).toBeNull();
  });
});
