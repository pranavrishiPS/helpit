import { describe, expect, it } from "vitest";
import { pickScrumTab, quoteSheetName } from "@/lib/scrum-sheet";

describe("pickScrumTab", () => {
  it("picks the Scrum tab ignoring case, wherever it sits", () => {
    expect(pickScrumTab(["Notes", "scrum", "Other"])).toBe("scrum");
    expect(pickScrumTab(["Scrum"])).toBe("Scrum");
  });

  it("uses a lone tab when none is named Scrum", () => {
    expect(pickScrumTab(["Sheet1"])).toBe("Sheet1");
  });

  it("never falls back to another tab when there are several", () => {
    expect(pickScrumTab(["Sheet1", "Notes"])).toBeUndefined();
    expect(pickScrumTab([])).toBeUndefined();
  });
});

describe("quoteSheetName", () => {
  it("quotes names and escapes single quotes", () => {
    expect(quoteSheetName("scrum")).toBe("'scrum'");
    expect(quoteSheetName("Pranav's tab")).toBe("'Pranav''s tab'");
  });
});
