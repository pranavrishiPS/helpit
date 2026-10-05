// Clears the Tasks-tab tasks from the PRODUCTION store (Vercel Blob "store.json").
// Mail- and Slack-sourced tasks are kept (they don't appear on the Tasks tab).
//
//   node scripts/clear-prod-tasks.mjs           # dry run: shows what would be removed
//   node scripts/clear-prod-tasks.mjs --apply   # backs up store.json to data/, then writes
//
// Reads the production token from HELPIT_PROD_BLOB_TOKEN (.env.local or the environment).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { get, put } from "@vercel/blob";

function loadEnvLocal() {
  const file = resolve(".env.local");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const token = process.env.HELPIT_PROD_BLOB_TOKEN || loadEnvLocal().HELPIT_PROD_BLOB_TOKEN;
if (!token) {
  console.error("HELPIT_PROD_BLOB_TOKEN not found (.env.local or environment).");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

const result = await get("store.json", { access: "private", useCache: false, token });
if (!result || !result.stream) {
  console.error("store.json not found in the production Blob store.");
  process.exit(1);
}
const text = await new Response(result.stream).text();
const store = JSON.parse(text);

const isTasksTab = (t) => t.source !== "mail" && t.source !== "slack" && !t.slackTs;
const removing = store.tasks.filter(isTasksTab);
const keeping = store.tasks.filter((t) => !isTasksTab(t));

console.log(`Production store: ${store.tasks.length} tasks total`);
console.log(`Would remove ${removing.length} Tasks-tab task(s), keep ${keeping.length}:`);
for (const t of removing) console.log(`  - [${t.status}] ${t.title}${t.dueDate ? ` (${t.dueDate})` : ""}`);

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to back up and write.");
  process.exit(0);
}

const backup = resolve("data", `store.prod-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backup, text);
console.log(`\nBackup written: ${backup}`);

await put("store.json", JSON.stringify({ ...store, tasks: keeping }, null, 2), {
  access: "private",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
  token,
});
console.log(`Done. Removed ${removing.length} task(s) from production.`);
