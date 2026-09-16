import {
  deleteJson,
  readJsonText,
  withJsonLock,
  writeJsonText,
} from "./json-persist";

const SLACK_FILE = "slack.json";

export interface SlackTokens {
  userId: string;
  accessToken: string;
  teamName?: string;
  lastSyncedAt?: string;
}

export async function readSlackTokens(): Promise<SlackTokens | null> {
  return withJsonLock(SLACK_FILE, async () => {
    try {
      const raw = await readJsonText(SLACK_FILE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SlackTokens>;
      if (!parsed.accessToken || !parsed.userId) return null;
      return parsed as SlackTokens;
    } catch {
      return null;
    }
  });
}

export async function writeSlackTokens(tokens: SlackTokens): Promise<void> {
  await withJsonLock(SLACK_FILE, async () => {
    await writeJsonText(SLACK_FILE, JSON.stringify(tokens, null, 2));
  });
}

export async function deleteSlackTokens(): Promise<void> {
  await deleteJson(SLACK_FILE);
}
