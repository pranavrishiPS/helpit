import type { DashboardStore, Outing, Task } from "./types";
import { isOutingPast } from "./utils";
import { syncSprintApprovals } from "./sprint-approvals";
import { normalizeRelease } from "./release-utils";
import { normalizeRecurringTasks } from "./recurrence";
import {
  backupJson,
  jsonExists,
  readJsonText,
  readJsonTextWithEtag,
  usesBlobStore,
  withJsonLock,
  writeJsonText,
  writeJsonTextIfMatch,
} from "./json-persist";

const STORE_FILE = "store.json";

/** Fresh stores start empty — no invented records (see CLAUDE.md "No dummy data"). */
function createDefaultStore(): DashboardStore {
  return {
    profile: {
      name: "Pranav",
      role: "Game Producer",
      company: "PlaySimple Games",
    },
    tasks: [],
    releases: [],
    outings: [],
    slackItems: [],
    mailItems: [],
    sprintApprovals: [],
    projectResources: [],
    plotBacklog: [],
    features: [],
    scrumMembers: [],
    scrumAttendance: [],
    scrumHolidays: [],
    recurringTasks: [],
    integrations: {
      gmail: { connected: false },
    },
    lastUpdated: new Date().toISOString(),
  };
}

async function ensureStore(): Promise<void> {
  const existing = await readJsonText(STORE_FILE);
  if (existing != null) return;
  // Never seed over a file that exists — an empty or unreadable store must not
  // silently become the default data.
  if (await jsonExists(STORE_FILE)) {
    throw new Error("[db] store.json exists but could not be read; refusing to overwrite it");
  }
  await writeJsonText(STORE_FILE, JSON.stringify(createDefaultStore(), null, 2));
}

async function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  return withJsonLock(STORE_FILE, async () => {
    await ensureStore();
    return fn();
  });
}

function normalizeOuting(raw: Outing & { pollOptions?: unknown }): Outing {
  const { pollOptions, ...outing } = raw;
  void pollOptions;
  let expenses = (outing.expenses ?? []).map((e) => ({
    ...e,
    type: (e.type as string) === "event" ? ("outing" as const) : e.type,
  }));

  if (expenses.length === 0 && outing.spent && outing.spent > 0) {
    expenses = [
      {
        id: `exp-${outing.id}-legacy`,
        title: "Outing",
        amount: outing.spent,
        date: outing.date,
        type: "outing" as const,
      },
    ];
  }

  const hasFollowUpExpenses = expenses.some((e) => e.type === "follow_up");
  const past = isOutingPast({ ...outing, expenses });
  let followUpAttendees = outing.followUpAttendees;

  if (!followUpAttendees?.length && (past || hasFollowUpExpenses)) {
    followUpAttendees = outing.attendees.filter((a) => a.confirmed);
  }

  return { ...outing, expenses, followUpAttendees };
}

interface LegacyReminder {
  id: string;
  title: string;
  message?: string;
  remindAt: string;
  linkedTaskId?: string;
  slackTs?: string;
  completed: boolean;
  createdAt: string;
}

type LegacyStore = DashboardStore & { reminders?: LegacyReminder[] };

function reminderToTask(reminder: LegacyReminder): Task {
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.message,
    status: reminder.completed ? "done" : "todo",
    priority: "medium",
    source: reminder.slackTs ? "slack" : "mail",
    dueDate: reminder.remindAt.split("T")[0],
    tags: [],
    slackTs: reminder.slackTs,
    createdAt: reminder.createdAt,
    updatedAt: reminder.createdAt,
  };
}

function migrateLegacyReminders(store: LegacyStore): DashboardStore {
  const reminders = store.reminders ?? [];
  if (reminders.length === 0) {
    const { reminders: legacyReminders, ...rest } = store;
    void legacyReminders;
    return rest;
  }

  const existingIds = new Set(store.tasks.map((t) => t.id));

  const migrated = reminders
    .filter((r) => !existingIds.has(r.id))
    .map(reminderToTask);

  const { reminders: legacyReminders, ...rest } = store;
  void legacyReminders;
  return { ...rest, tasks: [...rest.tasks, ...migrated] };
}

function migrateReleaseIds(store: DashboardStore): DashboardStore {
  const idMap = new Map<string, string>();
  let changed = false;
  const releases = store.releases.map((release) => {
    const normalized = normalizeRelease(release);
    if (normalized !== release) changed = true;
    if (normalized.id !== release.id) {
      idMap.set(release.id, normalized.id);
    }
    return normalized;
  });

  if (!changed) return store;

  if (idMap.size === 0) {
    return { ...store, releases };
  }

  const sprintApprovals = (store.sprintApprovals ?? []).map((approval) => {
    const mapped = approval.releaseId ? idMap.get(approval.releaseId) : undefined;
    if (!mapped) return approval;
    return {
      ...approval,
      id: `sprint-approval-${mapped}`,
      releaseId: mapped,
    };
  });

  return { ...store, releases, sprintApprovals };
}

/** "workshop" was renamed to the generic "other" status (with a free-text note). */
function migrateLegacyScrumStatus(store: DashboardStore): DashboardStore {
  const entries = store.scrumAttendance ?? [];
  let changed = false;
  const migrated = entries.map((entry) => {
    if ((entry.status as string) !== "workshop") return entry;
    changed = true;
    return { ...entry, status: "other" as const, note: entry.note ?? "Workshop" };
  });

  if (!changed) return store;
  return { ...store, scrumAttendance: migrated };
}

/** Holidays carry no attendance — drop any entry that sits on a holiday date (e.g. logged before the date was marked). */
export function dropAttendanceOnHolidays(store: DashboardStore): DashboardStore {
  const holidayDates = new Set((store.scrumHolidays ?? []).map((h) => h.date));
  const entries = store.scrumAttendance ?? [];
  if (holidayDates.size === 0) return store;

  const kept = entries.filter((e) => !holidayDates.has(e.date));
  if (kept.length === entries.length) return store;
  return { ...store, scrumAttendance: kept };
}

async function writeStoreUnlocked(store: DashboardStore): Promise<DashboardStore> {
  const updated = { ...store, lastUpdated: new Date().toISOString() };
  await writeJsonText(STORE_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

async function readStoreUnlocked(preRead?: string | null): Promise<DashboardStore> {
  // preRead (Blob mode) is the text already fetched; Blob mode never persists from a read.
  const persist = preRead === undefined;
  let raw = preRead !== undefined ? preRead : await readJsonText(STORE_FILE);
  if (raw == null) {
    await ensureStore();
    raw = await readJsonText(STORE_FILE);
  }

  let parsed: LegacyStore;
  try {
    if (!raw?.trim()) throw new Error("empty");
    parsed = JSON.parse(raw) as LegacyStore;
  } catch (err) {
    if (!persist) {
      // Blob: never reset — a corrupt read may be transient or a partial view.
      throw new Error("[db] store.json is corrupt or unreadable; refusing to reset it", {
        cause: err,
      });
    }
    console.error(
      "[db] store.json is corrupt or unreadable — backing up and resetting to empty store:",
      err
    );
    const backupName = `store.corrupt-${Date.now()}.bak`;
    try {
      await backupJson(STORE_FILE, backupName);
    } catch (backupErr) {
      console.error(`[db] failed to back up corrupt store.json to ${backupName}:`, backupErr);
      // Never destroy the only copy of the data.
      throw new Error(
        `[db] store.json is corrupt and could not be backed up to ${backupName}; refusing to reset it`,
        { cause: backupErr }
      );
    }
    await writeJsonText(STORE_FILE, JSON.stringify(createDefaultStore(), null, 2));
    parsed = createDefaultStore() as LegacyStore;
  }

  const migrated = migrateLegacyReminders(parsed);
  const withReleaseIds = migrateReleaseIds(migrated);
  const withApprovals = syncSprintApprovals({
    ...withReleaseIds,
    sprintApprovals: withReleaseIds.sprintApprovals ?? [],
    projectResources: withReleaseIds.projectResources ?? [],
    plotBacklog: withReleaseIds.plotBacklog ?? [],
    features: withReleaseIds.features ?? [],
    scrumMembers: withReleaseIds.scrumMembers ?? [],
    scrumAttendance: withReleaseIds.scrumAttendance ?? [],
    scrumHolidays: withReleaseIds.scrumHolidays ?? [],
    // Old stores lack the key. Persisted by the next write (a read alone never rewrites for this).
    recurringTasks: normalizeRecurringTasks(withReleaseIds.recurringTasks),
  });
  const withScrumStatusFixed = dropAttendanceOnHolidays(migrateLegacyScrumStatus(withApprovals));

  const shouldPersist =
    (parsed.reminders?.length ?? 0) > 0 ||
    migrated.projectResources == null ||
    migrated.plotBacklog == null ||
    migrated.features == null ||
    migrated.scrumMembers == null ||
    migrated.scrumAttendance == null ||
    migrated.scrumHolidays == null ||
    withScrumStatusFixed !== withApprovals ||
    JSON.stringify(parsed.releases) !== JSON.stringify(withReleaseIds.releases) ||
    JSON.stringify(parsed.sprintApprovals ?? []) !==
      JSON.stringify(withApprovals.sprintApprovals ?? []);

  if (shouldPersist) {
    const migratedStore = {
      ...withScrumStatusFixed,
      outings: withScrumStatusFixed.outings.map(normalizeOuting),
    };
    // Blob mode returns the migrated store in memory only; migrations are idempotent
    // and get persisted by the next updateStore (conditional write).
    if (!persist) return migratedStore;
    return writeStoreUnlocked(migratedStore);
  }

  return {
    ...withApprovals,
    outings: withApprovals.outings.map(normalizeOuting),
  };
}

/** Blob mode: read text + etag without ever writing; a missing blob yields an in-memory empty store. */
async function readBlobStoreText(): Promise<{ text: string; etag: string | null }> {
  const { text, etag } = await readJsonTextWithEtag(STORE_FILE);
  if (text != null) return { text, etag };
  if (await jsonExists(STORE_FILE)) {
    throw new Error("[db] store.json exists but could not be read; refusing to overwrite it");
  }
  // First-ever write: create-only (etag null).
  return { text: JSON.stringify(createDefaultStore()), etag: null };
}

export async function readStore(): Promise<DashboardStore> {
  if (usesBlobStore()) {
    const { text } = await readBlobStoreText();
    return readStoreUnlocked(text);
  }
  return withStoreLock(readStoreUnlocked);
}

const BLOB_UPDATE_MAX_ATTEMPTS = 8;

/**
 * Blob mode has no cross-instance lock, so updateStore is optimistic: read store + ETag,
 * apply the updater, write only if the ETag is unchanged, else re-read and re-apply.
 */
async function updateStoreOptimistic(
  updater: (store: DashboardStore) => DashboardStore
): Promise<DashboardStore> {
  for (let attempt = 1; attempt <= BLOB_UPDATE_MAX_ATTEMPTS; attempt++) {
    const { text, etag } = await readBlobStoreText();
    const store = await readStoreUnlocked(text);
    const result = updater(store);
    const synced = syncSprintApprovals(result);
    // No-op (e.g. 404 path): don't write or bump lastUpdated.
    if (result === store && synced === result) return store;
    const updated = { ...synced, lastUpdated: new Date().toISOString() };
    if (await writeJsonTextIfMatch(STORE_FILE, JSON.stringify(updated, null, 2), etag)) {
      return updated;
    }
    if (attempt < BLOB_UPDATE_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, Math.random() * 50 * attempt + 10));
    }
  }
  throw new Error(
    `[db] could not save store.json after ${BLOB_UPDATE_MAX_ATTEMPTS} attempts because it kept changing concurrently; please retry.`
  );
}

export async function updateStore(
  updater: (store: DashboardStore) => DashboardStore
): Promise<DashboardStore> {
  if (usesBlobStore()) return updateStoreOptimistic(updater);
  return withStoreLock(async () => {
    const store = await readStoreUnlocked();
    const result = updater(store);
    const synced = syncSprintApprovals(result);
    // No-op (e.g. 404 path): don't write or bump lastUpdated.
    if (result === store && synced === result) return store;
    return writeStoreUnlocked(synced);
  });
}
