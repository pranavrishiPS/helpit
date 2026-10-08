import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// globals.css declares the dark tokens twice: [data-theme="dark"] and the
// prefers-color-scheme fallback for an unresolved data-theme. They must match.

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");

function declarationsAfter(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

describe("dark theme tokens", () => {
  const explicit = declarationsAfter(':root[data-theme="dark"] {');
  const fallback = declarationsAfter(':root:not([data-theme="light"]):not([data-theme="dark"]) {');

  it("keeps the System fallback identical to data-theme=dark", () => {
    expect(fallback).toEqual(explicit);
  });

  it("sets color-scheme and the spec's key values", () => {
    expect(explicit["color-scheme"]).toBe("dark");
    expect(explicit["--background"]).toBe("#141312");
    expect(explicit["--card"]).toBe("#1E1C1A");
    expect(explicit["--accent"]).toBe("#F07A35");
    expect(explicit["--border"]).toBe("#35322E");
    expect(explicit["--on-fill"]).toBe("#141312");
    expect(explicit["--on-signal"]).toBe("#1A1918");
  });

  it("overrides every light token that dark changes", () => {
    const light = declarationsAfter(":root {");
    for (const key of Object.keys(explicit)) {
      expect(light, `light :root is missing ${key}`).toHaveProperty(key);
    }
  });
});
