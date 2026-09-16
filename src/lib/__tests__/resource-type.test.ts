import { describe, expect, it } from "vitest";
import { detectProjectResourceType } from "../utils";

describe("detectProjectResourceType", () => {
  it("detects Figma URLs", () => {
    expect(detectProjectResourceType("https://www.figma.com/file/abc/My-Design")).toBe("figma");
    expect(detectProjectResourceType("figma.com/design/xyz")).toBe("figma");
  });

  it("detects Google Docs and Notion as docs", () => {
    expect(detectProjectResourceType("https://docs.google.com/document/d/abc/edit")).toBe("doc");
    expect(detectProjectResourceType("https://notion.so/workspace/Page-Title")).toBe("doc");
  });

  it("detects Google Sheets and Slides", () => {
    expect(detectProjectResourceType("sheets.google.com/spreadsheets/d/abc")).toBe("sheets");
    expect(detectProjectResourceType("https://docs.google.com/spreadsheets/d/abc/edit")).toBe(
      "sheets"
    );
    expect(detectProjectResourceType("https://slides.google.com/presentation/d/abc/edit")).toBe(
      "slides"
    );
    expect(detectProjectResourceType("https://docs.google.com/presentation/d/abc/edit")).toBe(
      "slides"
    );
  });

  it("detects Confluence and SharePoint as docs", () => {
    expect(detectProjectResourceType("https://playsimple.atlassian.net/wiki/spaces/PROD/pages/1")).toBe(
      "doc"
    );
    expect(detectProjectResourceType("https://company.sharepoint.com/sites/team/Shared%20Documents")).toBe(
      "doc"
    );
  });

  it("defaults unknown URLs to link", () => {
    expect(detectProjectResourceType("https://linear.app/team/issue/ABC-1")).toBe("link");
    expect(detectProjectResourceType("")).toBe("link");
    expect(detectProjectResourceType("not a url")).toBe("link");
  });
});
