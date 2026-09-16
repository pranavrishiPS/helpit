import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

function loadResults() {
  const arg = process.argv[2];
  if (arg) return readFileSync(resolve(arg), "utf8");

  const dataDir = resolve("data");
  const pullFiles = readdirSync(dataDir)
    .filter((name) => name.startsWith("slack-mcp-pull") && name.endsWith(".txt"))
    .sort();
  if (pullFiles.length === 0) {
    throw new Error("No slack-mcp-pull*.txt files found in data/");
  }
  return pullFiles.map((name) => readFileSync(join(dataDir, name), "utf8")).join("\n\n");
}

const results = loadResults();

const res = await fetch("http://localhost:3000/api/slack/import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    results,
    userId: "U0AMXP1Q4RE",
    teamName: "Playsimple",
  }),
});

const data = await res.json();
if (!res.ok) {
  console.error(data.error ?? "Import failed");
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
