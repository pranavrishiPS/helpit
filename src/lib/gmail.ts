import { google } from "googleapis";
import type { MailItem } from "@/lib/types";
import { getAppUrl } from "@/lib/app-url";
import { readGmailTokens, writeGmailTokens, type GmailTokens } from "@/lib/gmail-store";
import { UserFacingError } from "@/lib/errors";
import { SPRINT_SUBJECT_PATTERN, categorizeMail } from "@/lib/mail-category";
import {
  addApprovalsFromMail,
  applyMailApprovals,
  needsMailCheck,
} from "@/lib/sprint-approvals";

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
    throw new UserFacingError("Google did not return access/refresh tokens. Try reconnecting.");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const email = profile.data.email;

  if (!email) {
    throw new UserFacingError("Could not read Gmail account email.");
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
    throw new UserFacingError("Gmail not connected");
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
 * - Re-fetched items keep the user's id, followUpDate and drafted/done status. Category is
 *   never user-edited, so it takes the freshly computed value (this also re-categorises
 *   legacy "internal"/"vendor" items).
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
        category: item.category,
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

  // Support mail is read in Gmail directly: never keep it, including items from older syncs.
  const mailItems = merged
    .filter((m) => categorizeMail(m.subject, m.from) !== "support")
    .sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
  return { mailItems, added, updated };
}

const GMAIL_PAGE_SIZE = 50;
const GMAIL_MAX_PAGES = 5;
const GMAIL_GET_BATCH = 10;
/** Inbox window; support senders are excluded up front so they cost no fetch calls. */
export const INBOX_QUERY =
  "in:inbox newer_than:30d -from:support -from:helpdesk -from:zendesk -from:freshdesk" +
  ' -"Freshdesk Tickets" -subject:"Feedback on Cryptogram" -subject:"Need some help on Cryptogram"';

/** Max messages fetched per build thread search. */
const GMAIL_THREAD_MAX_RESULTS = 50;

/**
 * Gmail search for a sprint approval's build thread across all mail (archived included),
 * e.g. `subject:"Android Build 1.192 Thread" newer_than:365d`. Quotes/backslashes are
 * stripped from the title so it can't break out of the phrase.
 */
export function buildApprovalThreadQuery(title: string): string {
  const safe = title.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  return `subject:"${safe} Thread" newer_than:365d`;
}

/**
 * Finds sprint build threads across all mail (Sent included: the user starts each thread),
 * so builds missing from Planning still get an approval row.
 */
export const SPRINT_THREAD_DISCOVERY_QUERY =
  'subject:Thread ("Android Build" OR "iOS Release") newer_than:60d';

/** One list page is enough for ~2 months of build threads. */
const GMAIL_DISCOVERY_MAX_RESULTS = 100;

type GmailClient = ReturnType<typeof google.gmail>;

/** Fetch metadata for ids in batches; failures are counted, not thrown. */
async function fetchMessages(
  gmail: GmailClient,
  ids: string[]
): Promise<{ items: MailItem[]; failed: number }> {
  const items: MailItem[] = [];
  let failed = 0;
  for (let i = 0; i < ids.length; i += GMAIL_GET_BATCH) {
    const batch = ids.slice(i, i + GMAIL_GET_BATCH);
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
        items.push(mapGmailMessage(batch[idx], result.value.data));
      } else {
        failed++;
      }
    });
  }
  return { items, failed };
}

/**
 * Messages on build threads for approvals that still need something. Only used to tick
 * approvals — never merged into mailItems. Ids in `skipIds` (already fetched) are skipped.
 */
async function fetchApprovalThreadMessages(
  gmail: GmailClient,
  titles: string[],
  skipIds: Set<string>
): Promise<{ items: MailItem[]; failed: number; searchFailed: number }> {
  const ids = new Set<string>();
  let searchFailed = 0;
  for (let i = 0; i < titles.length; i += GMAIL_GET_BATCH) {
    const batch = titles.slice(i, i + GMAIL_GET_BATCH);
    const results = await Promise.allSettled(
      batch.map((title) =>
        gmail.users.messages.list({
          userId: "me",
          maxResults: GMAIL_THREAD_MAX_RESULTS,
          q: buildApprovalThreadQuery(title),
        })
      )
    );
    for (const result of results) {
      if (result.status === "rejected") {
        searchFailed++;
        continue;
      }
      const found = (result.value.data.messages ?? []).slice(0, GMAIL_THREAD_MAX_RESULTS);
      for (const m of found) {
        if (m.id && !skipIds.has(m.id)) ids.add(m.id);
      }
    }
  }
  const { items, failed } = await fetchMessages(gmail, [...ids]);
  return { items, failed, searchFailed };
}

/**
 * Sprint thread messages from the discovery search, minus ids already fetched. Only
 * subjects matching SPRINT_SUBJECT_PATTERN are returned. Throws if the search fails.
 */
async function discoverSprintThreadMessages(
  gmail: GmailClient,
  skipIds: Set<string>
): Promise<{ items: MailItem[]; failed: number }> {
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: GMAIL_DISCOVERY_MAX_RESULTS,
    q: SPRINT_THREAD_DISCOVERY_QUERY,
  });
  const ids = new Set<string>();
  for (const m of (list.data.messages ?? []).slice(0, GMAIL_DISCOVERY_MAX_RESULTS)) {
    if (m.id && !skipIds.has(m.id)) ids.add(m.id);
  }
  const { items, failed } = await fetchMessages(gmail, [...ids]);
  return { items: items.filter((m) => SPRINT_SUBJECT_PATTERN.test(m.subject)), failed };
}

function syncErrorText(failed: number, searchFailed: number): string | undefined {
  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} message${failed === 1 ? "" : "s"} could not be fetched`);
  if (searchFailed > 0) {
    parts.push(`${searchFailed} build thread search${searchFailed === 1 ? "" : "es"} failed`);
  }
  return parts.length > 0 ? parts.join("; ") : undefined;
}

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
      q: INBOX_QUERY,
      pageToken,
    });
    for (const m of list.data.messages ?? []) {
      if (m.id) messageIds.push(m.id);
    }
    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  const inbox = await fetchMessages(gmail, messageIds);
  // The query skips most support mail before fetching; this catches what it misses.
  const fetched = inbox.items.filter((m) => m.category !== "support");
  let failed = inbox.failed;

  // Build threads may be archived or older than the inbox window: search all mail for the
  // approvals that still need a tick or a sent date. Errors here never fail the sync.
  const { readStore, updateStore } = await import("@/lib/db");
  let threadMessages: MailItem[] = [];
  let searchFailed = 0;
  try {
    const snapshot = await readStore();
    const titles = [
      ...new Set((snapshot.sprintApprovals ?? []).filter(needsMailCheck).map((a) => a.title)),
    ];
    if (titles.length > 0) {
      const thread = await fetchApprovalThreadMessages(gmail, titles, new Set(messageIds));
      threadMessages = thread.items;
      failed += thread.failed;
      searchFailed = thread.searchFailed;
    }
  } catch {
    searchFailed++;
  }

  // Discover build threads that have no approval row yet (e.g. not in Planning). New rows
  // are covered by these results, so they need no per-approval search this sync.
  let discovered: MailItem[] = [];
  try {
    const skipIds = new Set([
      ...messageIds,
      ...threadMessages.map((m) => m.gmailId).filter((id): id is string => !!id),
    ]);
    const discovery = await discoverSprintThreadMessages(gmail, skipIds);
    discovered = discovery.items;
    failed += discovery.failed;
  } catch {
    searchFailed++;
  }

  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  // Merge against the fresh store inside the lock, not a snapshot taken before the network calls.
  await updateStore((s) => {
    const merged = mergeGmailItems(s.mailItems, fetched);
    added = merged.added;
    updated = merged.updated;
    // Thread/discovered messages only feed approvals; they are never added to mailItems.
    const approvalMail = [...merged.mailItems, ...threadMessages, ...discovered];
    const withMailRows = addApprovalsFromMail(s.sprintApprovals ?? [], approvalMail, now);
    return {
      ...s,
      mailItems: merged.mailItems,
      // Auto-tick sprint approvals from the freshly merged mail (overrides respected).
      sprintApprovals: applyMailApprovals(withMailRows, approvalMail, now),
      integrations: {
        ...s.integrations,
        gmail: {
          connected: true,
          email: stored.email,
          lastSyncedAt: now,
          lastSyncError: syncErrorText(failed, searchFailed),
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
