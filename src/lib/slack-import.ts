import type { SlackSearchMatch } from "@/lib/slack";
import { parseSlackMatch } from "@/lib/slack";
import { readStore, updateStore } from "@/lib/db";
import type { SlackItem } from "@/lib/types";

/**
 * Parse Slack MCP `slack_search_*` markdown into Web API-style matches.
 * Each result block ends with a "---" rule on its own line; a "---" inside the message
 * (a markdown rule) is part of the text, so only a trailing one ends the message.
 */
export function parseMcpSlackSearchResults(markdown: string): SlackSearchMatch[] {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const matches: SlackSearchMatch[] = [];
  const blocks = normalized.split(/### Result \d+ of \d+\n/);

  for (const block of blocks.slice(1)) {
    const channelLine = block.match(/Channel: (.+)/)?.[1]?.trim();
    const fromLine = block.match(/From: (.+)/)?.[1]?.trim();
    const ts = block.match(/Message_ts: (.+)/)?.[1]?.trim();
    const rawPermalink = block.match(/Permalink: \[link\]\(([^)]+)\)/)?.[1]?.trim();
    // Rendered as an href later: only http(s) links are kept.
    const permalink = rawPermalink && /^https?:\/\//i.test(rawPermalink) ? rawPermalink : undefined;
    const text = block
      .match(/Text:[^\S\n]*\n([\s\S]*)$/)?.[1]
      ?.replace(/\n[^\S\n]*---[^\S\n]*(?:\n\s*)?$/, "")
      .trim();

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

/** Slack `ts` is only unique within a channel, so identity is channel + ts. */
function slackItemKey(channel: string | undefined, ts: string): string {
  return JSON.stringify([channel ?? "", ts]);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function importSlackMatches(
  rawMatches: SlackSearchMatch[],
  options?: { userId?: string; teamName?: string }
): Promise<{
  synced: number;
  addedSlack: number;
  addedTasks: number;
  /** Unset when no Slack user id is known; id-based mention detection is skipped then. */
  userId?: string;
  userIdMissing: boolean;
}> {
  const store = await readStore();
  const userId = options?.userId || store.integrations?.slack?.userId || undefined;
  const profileName = store.profile.name;
  const now = new Date().toISOString();

  const deduped = new Map<string, SlackSearchMatch>();
  for (const match of rawMatches) {
    if (match.ts) {
      deduped.set(slackItemKey(match.channel?.id ?? match.channel?.name, match.ts), match);
    }
  }

  const parsed = [...deduped.values()]
    .map((m) => parseSlackMatch(m, userId, profileName))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  let addedSlack = 0;

  // Dedupe against the FRESH store inside the lock, not the snapshot read above.
  await updateStore((s) => {
    addedSlack = 0; // reset: the updater re-runs on optimistic retries
    const seenKeys = new Set(
      s.slackItems.filter((i) => i.slackTs).map((i) => slackItemKey(i.channel, i.slackTs!))
    );
    const usedIds = new Set(s.slackItems.map((i) => i.id));
    const newSlackItems: SlackItem[] = [];

    for (const { slackItem } of parsed) {
      const ts = slackItem.slackTs;
      if (!ts) continue;
      const key = slackItemKey(slackItem.channel, ts);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      let id = `slack-${ts.replace(".", "-")}`;
      if (usedIds.has(id)) id = `${id}-${slugify(slackItem.channel) || "channel"}`;
      usedIds.add(id);

      newSlackItems.push({ ...slackItem, id, createdAt: now });
      addedSlack++;
    }

    return {
      ...s,
      slackItems: [...newSlackItems, ...s.slackItems],
      integrations: {
        ...s.integrations,
        slack: {
          connected: true,
          userId: userId ?? s.integrations?.slack?.userId,
          teamName: options?.teamName ?? s.integrations?.slack?.teamName,
          lastSyncedAt: now,
          lastSyncError: undefined,
        },
      },
    };
  });

  return { synced: parsed.length, addedSlack, addedTasks: 0, userId, userIdMissing: !userId };
}
