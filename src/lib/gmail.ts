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

/**
 * Merge freshly fetched Gmail items into the current mail list.
 * Pure: call it with the *fresh* store's mailItems (inside updateStore) so edits
 * made during the network phase of a sync are never clobbered.
 *
 * - Re-fetched items keep the user's id, category, followUpDate and drafted/done status.
 * - Gmail items missing from the fetch (older than the window, archived) are kept when
 *   the user has handled them (drafted/done) or set a followUpDate; everything else
 *   (unread / needs_reply, which the sync assigns automatically) is pruned.
 * - Manual items are always kept.
 */
export function mergeGmailItems(
  existingItems: MailItem[],
  fetched: MailItem[]
): { mailItems: MailItem[]; added: number; updated: number } {
  const fetchedByGmailId = new Map<string, MailItem>();
  for (const item of fetched) {
    if (item.gmailId) fetchedByGmailId.set(item.gmailId, item);
  }

  const existingByGmailId = new Map(
    existingItems.filter((m) => m.gmailId).map((m) => [m.gmailId!, m])
  );

  let added = 0;
  let updated = 0;
  const merged: MailItem[] = [];

  for (const item of fetchedByGmailId.values()) {
    const existing = existingByGmailId.get(item.gmailId!);
    if (existing) {
      const preserveStatus =
        existing.status === "drafted" || existing.status === "done";
      merged.push({
        ...existing,
        ...item,
        id: existing.id,
        status: preserveStatus ? existing.status : item.status,
        category: existing.category,
        followUpDate: existing.followUpDate,
      });
      updated++;
    } else {
      merged.push(item);
      added++;
    }
  }

  for (const existing of existingItems) {
    if (existing.gmailId && fetchedByGmailId.has(existing.gmailId)) continue;
    const isManual = existing.source !== "gmail" && !existing.gmailId;
    // needs_reply is NOT kept: the sync labels every read message that way, so keeping it
    // would never prune aged-out mail.
    const isHandled =
      existing.status === "drafted" || existing.status === "done" || !!existing.followUpDate;
    if (isManual || isHandled) merged.push(existing);
  }

  const mailItems = merged.sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
  return { mailItems, added, updated };
}

const GMAIL_PAGE_SIZE = 50;
const GMAIL_MAX_PAGES = 5;
const GMAIL_GET_BATCH = 10;

export async function syncGmailInbox(): Promise<{
  synced: number;
  added: number;
  updated: number;
  failed: number;
  email: string;
}> {
  const { client, stored } = await getAuthorizedClient();
  const gmail = google.gmail({ version: "v1", auth: client });

  const messageIds: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < GMAIL_MAX_PAGES; page++) {
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: GMAIL_PAGE_SIZE,
      q: "in:inbox newer_than:30d",
      pageToken,
    });
    for (const m of list.data.messages ?? []) {
      if (m.id) messageIds.push(m.id);
    }
    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  const fetched: MailItem[] = [];
  let failed = 0;
  for (let i = 0; i < messageIds.length; i += GMAIL_GET_BATCH) {
    const batch = messageIds.slice(i, i + GMAIL_GET_BATCH);
    const results = await Promise.allSettled(
      batch.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        })
      )
    );
    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        fetched.push(mapGmailMessage(batch[idx], result.value.data));
      } else {
        failed++;
      }
    });
  }

  const { updateStore } = await import("@/lib/db");
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  // Merge against the fresh store inside the lock, not a snapshot taken before the network calls.
  await updateStore((s) => {
    const merged = mergeGmailItems(s.mailItems, fetched);
    added = merged.added;
    updated = merged.updated;
    return {
      ...s,
      mailItems: merged.mailItems,
      integrations: {
        ...s.integrations,
        gmail: {
          connected: true,
          email: stored.email,
          lastSyncedAt: now,
          lastSyncError:
            failed > 0
              ? `${failed} message${failed === 1 ? "" : "s"} could not be fetched`
              : undefined,
        },
      },
    };
  });

  stored.lastSyncedAt = now;
  await writeGmailTokens(stored);

  return {
    synced: fetched.length,
    added,
    updated,
    failed,
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
