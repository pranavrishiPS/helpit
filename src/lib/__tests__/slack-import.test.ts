import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMcpSlackSearchResults } from "@/lib/slack-import";
import { parseSlackMatch } from "@/lib/slack";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "slack-mcp-pull.txt"
);

describe("parseMcpSlackSearchResults", () => {
  it("parses MCP markdown blocks", () => {
    const raw = readFileSync(fixturePath, "utf8");    const matches = parseMcpSlackSearchResults(raw);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.ts).toBeTruthy();
    expect(matches.find((m) => m.channel?.name === "cryptogram-pspn")).toBeTruthy();
    expect(matches.find((m) => m.channel?.name?.startsWith("DM"))).toBeTruthy();
  });

  it("maps parsed MCP matches to follow-ups", () => {
    const raw = readFileSync(fixturePath, "utf8");    const matches = parseMcpSlackSearchResults(raw);
    const parsed = matches
      .map((m) => parseSlackMatch(m, "U0AMXP1Q4RE", "Pranav"))
      .filter(Boolean);
    expect(parsed.length).toBeGreaterThan(0);
  });
});
