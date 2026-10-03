import { google } from "googleapis";
import { getAppUrl } from "@/lib/app-url";
import {
  readScrumSheetTokens,
  writeScrumSheetTokens,
  type ScrumSheetTokens,
} from "@/lib/scrum-sheet-store";
import { parseSheetRows, planScrumSync, type ScrumSyncPlan } from "@/lib/scrum-sheet-sync";

const SHEET_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];

/** Wide enough to cover a long-running daily standup tracker (Member + ~370 dates). */
const SHEET_RANGE = "A1:ZZ1000";

export function isScrumSheetConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getRedirectUri(): string {
  return (
    process.env.SCRUM_SHEET_REDIRECT_URI ??
    `${getAppUrl()}/api/scrum-attendance/sheet/callback`
  );
}

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

export function getScrumSheetAuthUrl(state?: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SHEET_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<ScrumSheetTokens> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google did not return access/refresh tokens. Try reconnecting.");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const email = profile.data.email;

  if (!email) {
    throw new Error("Could not read the connected Google account's email.");
  }

  const stored: ScrumSheetTokens = {
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000).toISOString(),
  };

  await writeScrumSheetTokens(stored);
  return stored;
}

async function getAuthorizedClient() {
  const stored = await readScrumSheetTokens();
  if (!stored) {
    throw new Error("Google Sheet not connected");
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: new Date(stored.expiresAt).getTime(),
  });

  const expiresSoon = new Date(stored.expiresAt).getTime() - Date.now() < 5 * 60 * 1000;
  if (expiresSoon) {
    const { credentials } = await client.refreshAccessToken();
    if (credentials.access_token) {
      stored.accessToken = credentials.access_token;
      stored.expiresAt = new Date(
        credentials.expiry_date ?? Date.now() + 3600 * 1000
      ).toISOString();
      await writeScrumSheetTokens(stored);
      client.setCredentials(credentials);
    }
  }

  return client;
}

export async function getScrumSheetStatus() {
  const tokens = await readScrumSheetTokens();
  const { readStore } = await import("@/lib/db");
  const store = await readStore();
  const scrumSheet = store.integrations?.scrumSheet;

  return {
    configured: isScrumSheetConfigured(),
    connected: !!tokens,
    email: tokens?.email ?? scrumSheet?.email,
    spreadsheetId: scrumSheet?.spreadsheetId,
    spreadsheetUrl: scrumSheet?.spreadsheetUrl,
    lastSyncedAt: scrumSheet?.lastSyncedAt,
    lastSyncError: scrumSheet?.lastSyncError,
  };
}

/** Extracts the spreadsheet id from a full Google Sheets URL, or returns a bare id as-is. */
export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function connectScrumSheet(urlOrId: string): Promise<{ spreadsheetId: string }> {
  const spreadsheetId = extractSpreadsheetId(urlOrId);
  if (!spreadsheetId) {
    throw new Error("Couldn't find a spreadsheet id in that URL.");
  }

  const client = await getAuthorizedClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  try {
    await sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId" });
  } catch {
    throw new Error(
      "Couldn't access that spreadsheet. Make sure the connected Google account has edit access to it."
    );
  }

  const { updateStore } = await import("@/lib/db");
  await updateStore((s) => ({
    ...s,
    integrations: {
      ...s.integrations,
      scrumSheet: {
        ...s.integrations?.scrumSheet,
        connected: true,
        spreadsheetId,
        spreadsheetUrl: urlOrId.trim(),
      },
    },
  }));

  return { spreadsheetId };
}

export async function syncScrumSheet(): Promise<{ membersSynced: number; entriesSynced: number }> {
  const { readStore, updateStore } = await import("@/lib/db");
  const store = await readStore();
  const spreadsheetId = store.integrations?.scrumSheet?.spreadsheetId;
  if (!spreadsheetId) {
    throw new Error("No Google Sheet connected yet.");
  }

  const client = await getAuthorizedClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const read = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: SHEET_RANGE,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = (read.data.values ?? []) as string[][];
  const parsedSheet = parseSheetRows(rows);

  if (rows.length > 1 && parsedSheet.dates.length === 0) {
    throw new Error(
      "Couldn't find a header row with dates in the sheet — nothing was changed. " +
        "Check that one row has 'Member' (or any text) in column A and dates across the rest of the row."
    );
  }

  // Recompute the merge from FRESH store state inside the store lock, so attendance
  // edited while we were talking to Google isn't overwritten by a stale snapshot.
  // The store is committed before the sheet is touched: if the sheet write fails, the
  // app state is already consistent and the next sync simply retries the (idempotent) write.
  const now = new Date().toISOString();
  let plan: ScrumSyncPlan | undefined;
  await updateStore((s) => {
    plan = planScrumSync({
      members: s.scrumMembers ?? [],
      attendance: s.scrumAttendance ?? [],
      holidayDates: new Set((s.scrumHolidays ?? []).map((h) => h.date)),
      rows,
    });
    return {
      ...s,
      scrumMembers: plan.merged.members,
      scrumAttendance: plan.merged.entries,
      integrations: {
        ...s.integrations,
        scrumSheet: {
          ...s.integrations?.scrumSheet,
          connected: true,
          lastSyncedAt: now,
          lastSyncError: undefined,
        },
      },
    };
  });
  if (!plan) throw new Error("Scrum sync produced no plan.");
  const { merged, updates } = plan as ScrumSyncPlan;

  // Only cells we own are written, at their real positions (header may sit below a notes row).
  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }

  return { membersSynced: merged.members.length, entriesSynced: merged.entries.length };
}
