import type { DashboardStore, Outing, Task } from "./types";
import { isOutingPast } from "./utils";
import { syncSprintApprovalsFromReleases } from "./sprint-approvals";
import { normalizeRelease } from "./release-utils";
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

const defaultStore: DashboardStore = {
  profile: {
    name: "Pranav",
    role: "Game Producer",
    company: "PlaySimple Games",
  },
  tasks: [
    {
      id: "task-1",
      title: "Review Q3 live-ops calendar draft",
      description: "Cross-check event dates with eng capacity and monetization goals.",
      status: "in_progress",
      priority: "high",
      source: "planning",
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
      tags: ["live-ops", "calendar"],
      owner: "Pranav",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-3",
      title: "Send sprint planning notes to stakeholders",
      status: "todo",
      priority: "high",
      source: "manual",
      dueDate: new Date().toISOString().split("T")[0],
      tags: ["sprint", "comms"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-4",
      title: "Check D1/D7 cohort after weekend event",
      description: "Pull retention numbers for the flash sale cohort.",
      status: "todo",
      priority: "medium",
      source: "mail",
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-5",
      title: "Ping QA on release build sign-off",
      status: "todo",
      priority: "medium",
      source: "mail",
      dueDate: new Date(Date.now() + 1 * 86400000).toISOString().split("T")[0],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-rel-1180-costing",
      title: "Fill function effort — Android 1.180",
      description:
        "Add person-days per function in Feature tracker (Product, UX, Game Designer, Art, Tech Art, Devs, QA) for Android 1.180. Scope: Streak LB event.",
      status: "todo",
      priority: "medium",
      source: "manual",
      dueDate: "2026-07-13",
      tags: ["release", "features", "costing"],
      owner: "Pranav",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-rel-ios-176-costing",
      title: "Fill function effort — iOS 1.76",
      description:
        "Add person-days per function in Feature tracker for iOS 1.76. Scope: Android 1.176 catchup, Android 1.178 catchup, Notif Permission, ATT.",
      status: "todo",
      priority: "medium",
      source: "manual",
      dueDate: "2026-07-15",
      tags: ["release", "features", "costing"],
      owner: "Pranav",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-rel-ios-178-costing",
      title: "Fill function effort — iOS 1.78",
      description:
        "Add person-days per function in Feature tracker for iOS 1.78. Scope: Android 1.180 catchup.",
      status: "todo",
      priority: "medium",
      source: "manual",
      dueDate: "2026-07-21",
      tags: ["release", "features", "costing"],
      owner: "Pranav",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-rel-android-1182-costing",
      title: "Fill function effort — Android 1.182",
      description:
        "Add person-days per function in Feature tracker for Android 1.182. Scope: Bubble Pop.",
      status: "todo",
      priority: "medium",
      source: "manual",
      dueDate: "2026-07-22",
      tags: ["release", "features", "costing"],
      owner: "Pranav",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  releases: [
    {
      id: "rel-android-1180",
      name: "Android 1.180",
      platform: "android",
      targetDate: "2026-07-13",
      status: "in_dev",
      notes: "Streak LB event",
      phase: "dev",
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "rel-ios-176",
      name: "iOS 1.76",
      platform: "ios",
      targetDate: "2026-07-15",
      status: "in_dev",
      notes: "Android 1.176 catchup, Android 1.178 catchup, Notif Permission, ATT",
      phase: "dev",
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "rel-ios-178",
      name: "iOS 1.78",
      platform: "ios",
      targetDate: "2026-07-21",
      status: "spec_ready",
      notes: "Android 1.180 catchup",
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "rel-android-1182",
      name: "Android 1.182",
      platform: "android",
      targetDate: "2026-07-22",
      status: "spec_ready",
      notes: "Bubble Pop",
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  outings: [
    {
      id: "out-q3",
      title: "Q3 Outing",
      destination: "TBD",
      date: new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0],
      budget: 42500,
      budgetPerPerson: 2500,
      expenses: [],
      attendees: [{ name: "Pranav", confirmed: true }],
      notes: "Finalize destination with the team.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  slackItems: [
    {
      id: "slack-1",
      channel: "#live-ops",
      summary: "Eng asking for final reward table for weekend event",
      action: "follow_up",
      priority: "urgent",
      dueDate: new Date().toISOString().split("T")[0],
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: "slack-2",
      channel: "#product",
      summary: "Monetization shared ARPDAU impact estimates — needs your review",
      action: "review",
      priority: "high",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: "slack-3",
      channel: "#team-general",
      summary: "Reminder: submit outing preferences by Friday",
      action: "remind",
      priority: "medium",
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString().split("T")[0],
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ],
  mailItems: [],
  sprintApprovals: [],
  projectResources: [],
  plotBacklog: [],
  features: [],
  scrumMembers: [],
  scrumAttendance: [],
  scrumHolidays: [],
  integrations: {
    gmail: { connected: false },
  },
  lastUpdated: new Date().toISOString(),
};

async function ensureStore(): Promise<void> {
  const existing = await readJsonText(STORE_FILE);
  if (existing != null) return;
  // Never seed over a file that exists — an empty or unreadable store must not
  // silently become the default data.
  if (await jsonExists(STORE_FILE)) {
    throw new Error("[db] store.json exists but could not be read; refusing to overwrite it");
  }
  await writeJsonText(STORE_FILE, JSON.stringify(defaultStore, null, 2));
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
  // preRead (Blob update loop) is the text already fetched together with its ETag.
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
    console.error(
      "[db] store.json is corrupt or unreadable — backing up and resetting to defaults:",
      err
    );
    const backupName = `store.corrupt-${Date.now()}.bak`;
    await backupJson(STORE_FILE, backupName).catch((backupErr) => {
      console.error(`[db] failed to back up corrupt store.json to ${backupName}:`, backupErr);
    });
    // Blob update loop (preRead) writes the result itself, conditionally on the ETag.
    if (preRead === undefined) {
      await writeJsonText(STORE_FILE, JSON.stringify(defaultStore, null, 2));
    }
    parsed =structuredClone(defaultStore) as LegacyStore;
  }

  const migrated = migrateLegacyReminders(parsed);
  const withReleaseIds = migrateReleaseIds(migrated);
  const withApprovals = syncSprintApprovalsFromReleases({
    ...withReleaseIds,
    sprintApprovals: withReleaseIds.sprintApprovals ?? [],
    projectResources: withReleaseIds.projectResources ?? [],
    plotBacklog: withReleaseIds.plotBacklog ?? [],
    features: withReleaseIds.features ?? [],
    scrumMembers: withReleaseIds.scrumMembers ?? [],
    scrumAttendance: withReleaseIds.scrumAttendance ?? [],
    scrumHolidays: withReleaseIds.scrumHolidays ?? [],
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
    const updated = {
      ...withScrumStatusFixed,
      outings: withScrumStatusFixed.outings.map(normalizeOuting),
      lastUpdated: new Date().toISOString(),
    };
    if (preRead === undefined) await writeStoreUnlocked(updated);
    return updated;
  }

  return {
    ...withApprovals,
    outings: withApprovals.outings.map(normalizeOuting),
  };
}

export async function readStore(): Promise<DashboardStore> {
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
    const { text, etag } = await readJsonTextWithEtag(STORE_FILE);
    let base: string | null = text;
    if (text == null) {
      if (await jsonExists(STORE_FILE)) {
        throw new Error("[db] store.json exists but could not be read; refusing to overwrite it");
      }
      base = JSON.stringify(defaultStore); // first-ever write: create-only (etag null)
    }
    const store = await readStoreUnlocked(base);
    const updated = {
      ...syncSprintApprovalsFromReleases(updater(store)),
      lastUpdated: new Date().toISOString(),
    };
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
    const updated = syncSprintApprovalsFromReleases(updater(store));
    return writeStoreUnlocked(updated);
  });
}
