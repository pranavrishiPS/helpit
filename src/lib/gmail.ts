import { google } from "googleapis";
import type { MailItem } from "@/lib/types";
import { getAppUrl } from "@/lib/app-url";
import { readGmailTokens, writeGmailTokens, type GmailTokens } from "@/lib/gmail-store";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isGmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ?? `${getAppUrl()}/api/gmail/callback`
  );
}

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

export function getGmailAuthUrl(state?: string, loginHint?: string): string {
  const client = getOAuth2Client();
  const hint = loginHint ?? process.env.GMAIL_LOGIN_HINT;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
    ...(hint ? { login_hint: hint } : {}),
  });
}

export async function exchangeCodeForTokens(code: string): Promise<GmailTokens> {
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
    throw new Error("Could not read Gmail account email.");
  }

  const stored: GmailTokens = {
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(
      tokens.expiry_date ?? Date.now() + 3600 * 1000
    ).toISOString(),
  };

  await writeGmailTokens(stored);
  return stored;
}

async function getAuthorizedClient() {
  const stored = await readGmailTokens();
  if (!stored) {
    throw new Error("Gmail not connected");
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: new Date(stored.expiresAt).getTime(),
  });

  const expiresSoon =
    new Date(stored.expiresAt).getTime() - Date.now() < 5 * 60 * 1000;

  if (expiresSoon) {
    const { credentials } = await client.refreshAccessToken();
    if (credentials.access_token) {
      stored.accessToken = credentials.access_token;
      stored.expiresAt = new Date(
        credentials.expiry_date ?? Date.now() + 3600 * 1000
      ).toISOString();
      await writeGmailTokens(stored);
      client.setCredentials(credentials);
    }
  }

  return { client, stored };
}

function getHeader(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string
): string {
  const found = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return found?.value ?? "";
}

function parseFrom(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim();
}

function categorizeMail(subject: string, from: string): MailItem["category"] {
  const lowerSubject = subject.toLowerCase();
  const lowerFrom = from.toLowerCase();

  if (
    lowerSubject.includes("[support]") ||
    lowerSubject.includes("support ticket") ||
    lowerFrom.includes("support@")
  ) {
    return "support";
  }
  if (
    lowerSubject.includes("quote") ||
    lowerSubject.includes("vendor") ||
    lowerFrom.includes("vendor")
  ) {
    return "vendor";
  }
  if (lowerFrom.includes("playsimple") || lowerFrom.includes("@psg.")) {
    return "internal";
  }
  return "other";
}

function mapGmailMessage(
  id: string,
  data: {
    snippet?: string | null;
    internalDate?: string | null;
    labelIds?: string[] | null;
    payload?: { headers?: { name?: string | null; value?: string | null }[] };
  }
): MailItem {
  const headers = data.payload?.headers;
  const subject = getHeader(headers, "Subject") || "(No subject)";
  const fromRaw = getHeader(headers, "From") || "unknown";
  const from = parseFrom(fromRaw);
  const isUnread = data.labelIds?.includes("UNREAD") ?? false;

  return {
    id: `gmail-${id}`,
    gmailId: id,
    source: "gmail",
    subject,
    from,
    category: categorizeMail(subject, from),
    summary: data.snippet ?? "",
    status: isUnread ? "unread" : "needs_reply",
    receivedAt: data.internalDate
      ? new Date(parseInt(data.internalDate, 10)).toISOString()
      : new Date().toISOString(),
  };
}

export async function syncGmailInbox(): Promise<{
  synced: number;
  added: number;
  updated: number;
  email: string;
}> {
  const { client, stored } = await getAuthorizedClient();
  const gmail = google.gmail({ version: "v1", auth: client });

  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: 40,
    q: "in:inbox newer_than:30d",
  });

  const messageIds = list.data.messages?.map((m) => m.id).filter(Boolean) ?? [];
  const fetched: MailItem[] = [];

  for (const id of messageIds) {
    if (!id) continue;
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });
    fetched.push(mapGmailMessage(id, msg.data));
  }

  const { readStore, updateStore } = await import("@/lib/db");
  const store = await readStore();
  const existingByGmailId = new Map(
    store.mailItems
      .filter((m) => m.gmailId)
      .map((m) => [m.gmailId!, m])
  );

  let added = 0;
  let updated = 0;
  const manualItems = store.mailItems.filter((m) => m.source !== "gmail" && !m.gmailId);
  const mergedGmail: MailItem[] = [];

  for (const item of fetched) {
    const existing = existingByGmailId.get(item.gmailId!);
    if (existing) {
      const preserveStatus =
        existing.status === "drafted" || existing.status === "done";
      mergedGmail.push({
        ...item,
        id: existing.id,
        status: preserveStatus ? existing.status : item.status,
        category: existing.category,
        followUpDate: existing.followUpDate,
      });
      updated++;
    } else {
      mergedGmail.push(item);
      added++;
    }
  }

  const mailItems = [...mergedGmail, ...manualItems].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  const now = new Date().toISOString();
  await updateStore((s) => ({
    ...s,
    mailItems,
    integrations: {
      ...s.integrations,
      gmail: {
        connected: true,
        email: stored.email,
        lastSyncedAt: now,
        lastSyncError: undefined,
      },
    },
  }));

  stored.lastSyncedAt = now;
  await writeGmailTokens(stored);

  return {
    synced: fetched.length,
    added,
    updated,
    email: stored.email,
  };
}

export async function getGmailStatus() {
  const tokens = await readGmailTokens();
  const { readStore } = await import("@/lib/db");
  const store = await readStore();
  const gmail = store.integrations?.gmail;

  return {
    configured: isGmailConfigured(),
    connected: !!tokens,
    email: tokens?.email ?? gmail?.email,
    lastSyncedAt: tokens?.lastSyncedAt ?? gmail?.lastSyncedAt,
    lastSyncError: gmail?.lastSyncError,
  };
}
