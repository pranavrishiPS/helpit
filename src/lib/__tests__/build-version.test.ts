import { describe, expect, it } from "vitest";
import { compareBuildVersionTitlesDesc, formatSprintApprovalTitle } from "@/lib/utils";

describe("compareBuildVersionTitlesDesc", () => {
  it("sorts higher build numbers first", () => {
    const titles = [
      "Android Build 1.178",
      "Android Build 1.182",
      "iOS Release 1.74",
      "Android Build 1.176",
      "iOS Release 1.78",
      "Android Build 1.180",
      "iOS Release 1.76",
    ];
    const sorted = [...titles].sort(compareBuildVersionTitlesDesc);
    expect(sorted).toEqual([
      "Android Build 1.182",
      "Android Build 1.180",
      "Android Build 1.178",
      "Android Build 1.176",
      "iOS Release 1.78",
      "iOS Release 1.76",
      "iOS Release 1.74",
    ]);
  });
});

describe("formatSprintApprovalTitle", () => {
  it("formats iOS titles as iOS Release X.XX", () => {
    expect(formatSprintApprovalTitle("iOS 1.76", "ios")).toBe("iOS Release 1.76");
    expect(formatSprintApprovalTitle("iOS Release 1.74", "ios")).toBe("iOS Release 1.74");
  });

  it("formats Android titles as Android Build X.XX", () => {
    expect(formatSprintApprovalTitle("Android 1.180", "android")).toBe("Android Build 1.180");
    expect(formatSprintApprovalTitle("Android Build 1.178", "android")).toBe(
      "Android Build 1.178"
    );
  });
});
