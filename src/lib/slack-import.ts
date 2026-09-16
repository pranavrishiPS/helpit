import type { SlackSearchMatch } from "@/lib/slack";
import { parseSlackMatch } from "@/lib/slack";
import { readStore, updateStore } from "@/lib/db";
import type { SlackItem } from "@/lib/types";

/** Parse Slack MCP `slack_search_*` markdown into Web API-style matches. */
export function parseMcpSlackSearchResults(markdown: string): SlackSearchMatch[] {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const matches: SlackSearchMatch[] = [];
  const blocks = normalized.split(/### Result \d+ of \d+\n/);

  for (const block of blocks.slice(1)) {
    const channelLine = block.match(/Channel: (.+)/)?.[1]?.trim();
    const fromLine = block.match(/From: (.+)/)?.[1]?.trim();
    const ts = block.match(/Message_ts: (.+)/)?.[1]?.trim();
    const permalink = block.match(/Permalink: \[link\]\(([^)]+)\)/)?.[1]?.trim();
    const text = block.match(/Text:\s*\n([\s\S]*?)(?:\n---|$)/)?.[1]?.trim();

    if (!ts || !text) continue;

    let channelName: string | undefined;
    if (channelLine?.includes("#")) {
      channelName = channelLine.replace(/^#\s*/, "").replace(/\s*\(ID:.*$/, "");
    } else if (channelLine?.startsWith("DM")) {
      const fromName = fromLine?.split("<")[0].trim();
      channelName = fromName ? `DM · ${fromName}` : "DM";
    }

    const username = fromLine?.split("<")[0].trim();

    matches.push({
      ts,
      text,
      username,
      permalink,
      channel: channelName ? { name: channelName } : undefined,
    });
  }

  return matches;
}

export async function importSlackMatches(
  rawMatches: SlackSearchMatch[],
  options?: { userId?: string; teamName?: string }
): Promise<{
  synced: number;
  addedSlack: number;
  addedTasks: number;
  userId: string;
}> {
  const store = await readStore();
  const userId = options?.userId ?? store.integrations?.slack?.userId ?? "U0AMXP1Q4RE";
  const profileName = store.profile.name;
  const now = new Date().toISOString();

  const deduped = new Map<string, SlackSearchMatch>();
  for (const match of rawMatches) {
    if (match.ts) deduped.set(match.ts, match);
  }

  const parsed = [...deduped.values()]
    .map((m) => parseSlackMatch(m, userId, profileName))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const existingSlackTs = new Set(store.slackItems.map((s) => s.slackTs).filter(Boolean));

  let addedSlack = 0;
  const newSlackItems: SlackItem[] = [];

  for (const item of parsed) {
    if (item.slackItem.slackTs && !existingSlackTs.has(item.slackItem.slackTs)) {
      newSlackItems.push({
        ...item.slackItem,
        id: `slack-${item.slackItem.slackTs.replace(".", "-")}`,
        createdAt: now,
      });
      addedSlack++;
    }
  }

  const manualSlack = store.slackItems.filter((s) => s.source !== "slack" && !s.slackTs);

  await updateStore((s) => ({
    ...s,
    slackItems: [
      ...newSlackItems,
      ...s.slackItems.filter((item) => item.slackTs),
      ...manualSlack,
    ],
    tasks: s.tasks.filter((t) => t.source !== "slack" && !t.slackTs),
    integrations: {
      ...s.integrations,
      slack: {
        connected: true,
        userId,
        teamName: options?.teamName ?? s.integrations?.slack?.teamName,
        lastSyncedAt: now,
        lastSyncError: undefined,
      },
    },
  }));

  return { synced: parsed.length, addedSlack, addedTasks: 0, userId };
}
