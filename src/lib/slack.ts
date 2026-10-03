import { WebClient } from "@slack/web-api";
import { format, subDays } from "date-fns";
import type { SlackItem, TaskPriority } from "@/lib/types";
import { getAppUrl } from "@/lib/app-url";
import { UserFacingError } from "@/lib/errors";
import {
  readSlackTokens,
  writeSlackTokens,
  type SlackTokens,
} from "@/lib/slack-store";

/** Workspace-approved user scopes (search:read and channels:history removed per IT policy) */
export const SLACK_USER_SCOPES = [
  "groups:history",
  "im:history",
  "mpim:history",
  "users:read",
];

export const SLACK_AUTO_SYNC_AVAILABLE = false;

export const SLACK_AUTO_SYNC_DISABLED_REASON =
  "Auto-sync needs the search:read permission, which isn’t approved for this workspace. Add follow-ups manually or ask IT to approve search:read.";

export interface SlackSearchMatch {
  ts?: string;
  text?: string;
  username?: string;
  permalink?: string;
  channel?: { id?: string; name?: string };
}

export interface ParsedSlackFollowup {
  slackItem: Omit<SlackItem, "id" | "createdAt">;
}

export class SlackRateLimitError extends UserFacingError {
  rateLimited = true;

  constructor(message = "Slack rate limit reached. Sync will retry in 10 minutes.") {
    super(message);
    this.name = "SlackRateLimitError";
  }
}

export function isSlackRateLimitError(err: unknown): boolean {
  if (err instanceof SlackRateLimitError) return true;
  if (!err || typeof err !== "object") return false;

  const e = err as Record<string, unknown>;
  if (e.code === "slack_webapi_rate_limited_error") return true;
  if (e.data && typeof e.data === "object") {
    const data = e.data as Record<string, unknown>;
    if (data.error === "rate_limited") return true;
  }
  if (err instanceof Error && err.message.toLowerCase().includes("rate limit")) {
    return true;
  }
  return false;
}

function throwIfSlackRateLimited(error: string | undefined): void {
  if (error === "rate_limited") {
    throw new SlackRateLimitError();
  }
}

export function isSlackConfigured(): boolean {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
  const userToken = process.env.SLACK_USER_TOKEN?.trim();
  return !!(clientId && clientSecret) || !!userToken;
}

export function getSlackRedirectUri(): string {
  return process.env.SLACK_REDIRECT_URI ?? `${getAppUrl()}/api/slack/callback`;
}

export function getSlackAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    user_scope: SLACK_USER_SCOPES.join(","),
    redirect_uri: getSlackRedirectUri(),
  });
  if (state) params.set("state", state);
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

export async function exchangeSlackCode(code: string): Promise<SlackTokens> {
  const body = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    client_secret: process.env.SLACK_CLIENT_SECRET!,
    code,
    redirect_uri: getSlackRedirectUri(),
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();

  if (!data.ok || !data.authed_user?.access_token) {
    throw new Error(data.error ?? "Slack OAuth failed");
  }

  const tokens: SlackTokens = {
    userId: data.authed_user.id,
    accessToken: data.authed_user.access_token,
    teamName: data.team?.name,
  };
  await writeSlackTokens(tokens);
  return tokens;
}

async function getSlackClient(): Promise<{ client: WebClient; tokens: SlackTokens }> {
  const envToken = process.env.SLACK_USER_TOKEN;
  const stored = await readSlackTokens();

  if (stored?.accessToken) {
    return { client: new WebClient(stored.accessToken), tokens: stored };
  }

  if (envToken) {
    const client = new WebClient(envToken);
    const auth = await client.auth.test();
    if (!auth.ok || !auth.user_id) {
      throw new UserFacingError("Invalid SLACK_USER_TOKEN");
    }
    const tokens: SlackTokens = {
      userId: auth.user_id,
      accessToken: envToken,
      teamName: auth.team,
    };
    return { client, tokens };
  }

  throw new UserFacingError("Slack not connected");
}

function cleanText(text: string): string {
  return text
    .replace(/<@[^>]+>/g, "")
    .replace(/<#[^>]+>/g, "")
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function channelLabel(match: SlackSearchMatch): string {
  const name = match.channel?.name;
  if (!name) return "#slack";
  if (name.startsWith("DM")) return name;
  return name.startsWith("#") ? name : `#${name}`;
}

function isNoise(match: SlackSearchMatch): boolean {
  const text = (match.text ?? "").toLowerCase();
  const user = (match.username ?? "").toLowerCase();
  if (user.includes("google calendar")) return true;
  if (user === "slack" && text.includes("added you to")) return true;
  if (text.includes("today-") && text.includes("date_long")) return true;
  if (text.includes("your request has been submitted")) return false;
  if (text.includes("approved") && text.length < 30) return true;
  if (text === "sure" || text === "i can help with that") return true;
  if (text.includes("what is my scrum update")) return true;
  if (text.includes("don't update anything for me")) return true;
  if (text.includes("valo account")) return true;
  if (text.includes("not feeling any better, taking")) return true;
  return false;
}

function inferPriority(text: string): TaskPriority {
  const lower = text.toLowerCase();
  if (lower.includes("urgent") || lower.includes("asap") || lower.includes("eod")) {
    return "urgent";
  }
  if (
    lower.includes("eta") ||
    lower.includes("reminder") ||
    lower.includes("please confirm") ||
    lower.includes("close") ||
    lower.includes("today")
  ) {
    return "high";
  }
  if (lower.includes("gentle reminder") || lower.includes("checking if")) {
    return "medium";
  }
  return "medium";
}

function inferAction(text: string): SlackItem["action"] {
  const lower = text.toLowerCase();
  if (lower.includes("remind")) return "remind";
  if (lower.includes("review") || lower.includes("spec")) return "review";
  if (lower.includes("?") || lower.includes("please") || lower.includes("eta")) {
    return "reply";
  }
  return "follow_up";
}

function inferDueDate(text: string): string | undefined {
  const lower = text.toLowerCase();
  const today = format(new Date(), "yyyy-MM-dd");
  if (lower.includes("today") || lower.includes("eod")) return today;
  if (lower.includes("tomorrow")) {
    return format(subDays(new Date(), -1), "yyyy-MM-dd");
  }
  return undefined;
}

export function parseSlackMatch(
  match: SlackSearchMatch,
  userId: string | undefined,
  profileName?: string
): ParsedSlackFollowup | null {
  if (!match.ts || !match.text || isNoise(match)) return null;

  const text = match.text;
  const lower = text.toLowerCase();
  const channel = channelLabel(match);
  const priority = inferPriority(text);
  const dueDate = inferDueDate(text);
  const summary = cleanText(text).slice(0, 200) || "Slack follow-up";

  const nameLower = profileName?.toLowerCase();
  const mentionsUser =
    (userId ? text.includes(`<@${userId}`) : false) ||
    (nameLower ? lower.includes(nameLower) : false) ||
    !channel.startsWith("#");

  const needsAction =
    mentionsUser &&
    (lower.includes("eta") ||
      lower.includes("please") ||
      lower.includes("reminder") ||
      lower.includes("confirm") ||
      lower.includes("when should") ||
      lower.includes("close") ||
      lower.includes("update") ||
      lower.includes("let us know") ||
      lower.includes("checking if") ||
      lower.includes("gentle reminder") ||
      lower.includes("daaldo") ||
      lower.includes("timelines") ||
      lower.includes("catchup") ||
      lower.includes("catch up"));

  if (!needsAction) return null;

  const slackItem: ParsedSlackFollowup["slackItem"] = {
    channel,
    summary,
    action: inferAction(text),
    priority,
    dueDate,
    threadUrl: match.permalink,
    slackTs: match.ts,
    source: "slack",
    completed: false,
  };

  const result: ParsedSlackFollowup = { slackItem };
  return result;
}

export async function syncSlackFollowups(): Promise<{
  synced: number;
  addedSlack: number;
  addedTasks: number;
  userId?: string;
  userIdMissing: boolean;
}> {
  if (!SLACK_AUTO_SYNC_AVAILABLE) {
    throw new UserFacingError(SLACK_AUTO_SYNC_DISABLED_REASON);
  }

  const { client, tokens } = await getSlackClient();
  const after = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const queries = [
    `<@${tokens.userId}> after:${after}`,
    `to:me after:${after}`,
  ];

  const matchMap = new Map<string, SlackSearchMatch>();
  for (const query of queries) {
    try {
      const res = await client.search.messages({
        query,
        count: 30,
        sort: "timestamp",
        sort_dir: "desc",
      });
      if (!res.ok) {
        throwIfSlackRateLimited(res.error);
        throw new Error(res.error ?? "Slack search failed");
      }
      for (const m of res.messages?.matches ?? []) {
        if (m.ts) matchMap.set(`${m.channel?.id ?? m.channel?.name ?? ""}|${m.ts}`, m as SlackSearchMatch);
      }
    } catch (err) {
      if (isSlackRateLimitError(err)) {
        throw new SlackRateLimitError();
      }
      throw err;
    }
  }

  const result = await import("@/lib/slack-import").then((m) =>
    m.importSlackMatches([...matchMap.values()], {
      userId: tokens.userId,
      teamName: tokens.teamName,
    })
  );

  tokens.lastSyncedAt = new Date().toISOString();
  const stored = await readSlackTokens();
  if (stored) {
    await writeSlackTokens({ ...stored, lastSyncedAt: tokens.lastSyncedAt });
  }

  return result;
}

export async function getSlackStatus() {
  const tokens = await readSlackTokens();
  const envToken = !!process.env.SLACK_USER_TOKEN;
  const { readStore } = await import("@/lib/db");
  const store = await readStore();
  const slack = store.integrations?.slack;

  return {
    configured: isSlackConfigured(),
    connected: !!(tokens || envToken),
    autoSyncAvailable: SLACK_AUTO_SYNC_AVAILABLE,
    autoSyncDisabledReason: SLACK_AUTO_SYNC_AVAILABLE
      ? undefined
      : SLACK_AUTO_SYNC_DISABLED_REASON,
    userId: tokens?.userId ?? slack?.userId,
    teamName: tokens?.teamName ?? slack?.teamName,
    lastSyncedAt: tokens?.lastSyncedAt ?? slack?.lastSyncedAt,
    lastSyncError: slack?.lastSyncError,
  };
}
