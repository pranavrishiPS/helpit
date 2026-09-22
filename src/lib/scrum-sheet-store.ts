import {
  deleteJson,
  readJsonText,
  withJsonLock,
  writeJsonText,
} from "./json-persist";

const SHEET_TOKENS_FILE = "scrum-sheet-oauth.json";

export interface ScrumSheetTokens {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export async function readScrumSheetTokens(): Promise<ScrumSheetTokens | null> {
  return withJsonLock(SHEET_TOKENS_FILE, async () => {
    try {
      const raw = await readJsonText(SHEET_TOKENS_FILE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ScrumSheetTokens>;
      if (!parsed.accessToken || !parsed.refreshToken || !parsed.email) return null;
      return parsed as ScrumSheetTokens;
    } catch (err) {
      console.error("[scrum-sheet-store] failed to read/parse scrum-sheet-oauth.json:", err);
      return null;
    }
  });
}

export async function writeScrumSheetTokens(tokens: ScrumSheetTokens): Promise<void> {
  await withJsonLock(SHEET_TOKENS_FILE, async () => {
    await writeJsonText(SHEET_TOKENS_FILE, JSON.stringify(tokens, null, 2));
  });
}

export async function deleteScrumSheetTokens(): Promise<void> {
  await deleteJson(SHEET_TOKENS_FILE);
}
