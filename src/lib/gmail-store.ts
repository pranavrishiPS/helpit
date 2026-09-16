import {
  deleteJson,
  readJsonText,
  withJsonLock,
  writeJsonText,
} from "./json-persist";

const GMAIL_FILE = "gmail.json";

export interface GmailTokens {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  lastSyncedAt?: string;
}

export async function readGmailTokens(): Promise<GmailTokens | null> {
  return withJsonLock(GMAIL_FILE, async () => {
    try {
      const raw = await readJsonText(GMAIL_FILE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<GmailTokens>;
      if (!parsed.accessToken || !parsed.refreshToken || !parsed.email) return null;
      return parsed as GmailTokens;
    } catch {
      return null;
    }
  });
}

export async function writeGmailTokens(tokens: GmailTokens): Promise<void> {
  await withJsonLock(GMAIL_FILE, async () => {
    await writeJsonText(GMAIL_FILE, JSON.stringify(tokens, null, 2));
  });
}

export async function deleteGmailTokens(): Promise<void> {
  await deleteJson(GMAIL_FILE);
}
