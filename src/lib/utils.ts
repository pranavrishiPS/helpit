import { format, isToday, isTomorrow, parseISO, isPast, startOfDay, isBefore } from "date-fns";
import type { DashboardStore, Release, ReleasePlatform, Task, Outing, ProjectResourceType } from "./types";

export function getReleasePlatform(release: Release): ReleasePlatform | null {
  if (release.platform) return release.platform;
  const lower = release.name.toLowerCase();
  if (lower.startsWith("android")) return "android";
  if (lower.startsWith("ios")) return "ios";
  return null;
}

/** Parse major.minor build number from titles like "Android Build 1.178" or "iOS 1.76". */
export function parseBuildVersion(title: string): [number, number] {
  const match = title.match(/(\d+)\.(\d+)/);
  if (!match) return [0, 0];
  return [Number(match[1]), Number(match[2])];
}

/** Split release notes into sprint scope items (one per line). */
export function parseSprintItems(notes?: string): string[] {
  if (!notes?.trim()) return [];
  return notes
    .split(/[\n,]+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function formatSprintItems(items: string[]): string | undefined {
  const filtered = items.map((s) => s.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join("\n") : undefined;
}

/** Sprint costing mail display title — iOS: "iOS Release X.XX", Android: "Android Build X.XX". */
export function formatSprintApprovalTitle(
  title: string,
  platform?: ReleasePlatform
): string {
  const version = title.match(/(\d+\.\d+)/)?.[1];
  if (!version) return title;

  const lower = title.toLowerCase();
  const plat =
    platform ??
    (lower.includes("android") ? "android" : lower.includes("ios") ? "ios" : undefined);

  if (plat === "ios") return `iOS Release ${version}`;
  if (plat === "android") return `Android Build ${version}`;
  return title;
}

/** Higher build numbers first (1.182 above 1.180 above 1.178). */
export function compareBuildVersionTitlesDesc(a: string, b: string): number {
  const [aMaj, aMin] = parseBuildVersion(a);
  const [bMaj, bMin] = parseBuildVersion(b);
  if (aMaj !== bMaj) return bMaj - aMaj;
  return bMin - aMin;
}

export function releasePlatformTitleClass(platform: ReleasePlatform | null): string {
  if (platform === "android") return "text-emerald-700";
  if (platform === "ios") return "text-blue-600";
  return "text-foreground";
}

export function releasePlatformCardClass(platform: ReleasePlatform | null): string {
  if (platform === "android") return "border-l-4 border-l-emerald-500";
  if (platform === "ios") return "border-l-4 border-l-blue-500";
  return "";
}

export function releasePlatformDateClass(platform: ReleasePlatform | null): string {
  const base =
    "rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums";
  if (platform === "android") {
    return `${base} border-emerald-300 bg-emerald-100 text-emerald-900`;
  }
  if (platform === "ios") {
    return `${base} border-blue-300 bg-blue-100 text-blue-900`;
  }
  return `${base} border-border bg-slate-100 text-foreground`;
}

export function formatReleaseDate(dateStr?: string, compact = false): string {
  if (!dateStr) return "TBD";
  const date = parseISO(dateStr);
  return format(date, compact ? "do MMM, yy" : "do MMMM, yy");
}

export function formatDueDate(dateStr?: string): string {
  if (!dateStr) return "No date";
  const date = parseISO(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d");
}

export function isOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  const date = parseISO(dateStr);
  return isPast(date) && !isToday(date);
}

export function priorityColor(priority: string): string {
  switch (priority) {
    case "urgent":
      return "text-warning bg-warning/10 border-warning/30";
    case "high":
      return "text-warning bg-warning/10 border-warning/20";
    case "medium":
      return "text-accent-secondary bg-accent-secondary/10 border-accent-secondary/20";
    default:
      return "text-muted bg-background border-border";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "done":
    case "live":
    case "completed":
      return "text-accent bg-accent/10";
    case "in_progress":
    case "in_dev":
    case "qa":
      return "text-accent-secondary bg-accent-secondary/10";
    case "blocked":
      return "text-warning bg-warning/10";
    default:
      return "text-muted bg-background";
  }
}

import type { ReleasePhase } from "./types";

export function releasePhaseColor(phase?: ReleasePhase | string): string {
  switch (phase) {
    case "ux":
      return "text-violet-700 bg-violet-50 border-violet-200";
    case "art":
      return "text-pink-700 bg-pink-50 border-pink-200";
    case "animation":
      return "text-orange-700 bg-orange-50 border-orange-200";
    case "dev":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "qa":
      return "text-amber-700 bg-amber-50 border-amber-200";
    default:
      return "text-slate-700 bg-slate-100 border-slate-200";
  }
}

/** Personal reminders added from the Mail tab. */
export function getMailTabTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.source === "mail");
}

/** Work todos for the Tasks tab (excludes mail reminders and Slack follow-ups). */
export function getTasksTabTasks(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) => t.source !== "mail" && t.source !== "slack" && !t.slackTs
  );
}

export function getTodayTasks(tasks: Task[]): Task[] {
  const today = new Date().toISOString().split("T")[0];
  return tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate <= today
  );
}

export function getUpcomingTasks(tasks: Task[]): Task[] {
  const today = new Date().toISOString().split("T")[0];
  return tasks
    .filter((t) => t.status !== "done" && t.dueDate && t.dueDate > today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

export function getOverdueTasks(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) => t.status !== "done" && isOverdue(t.dueDate)
  );
}

export function buildAssistantContext(store: DashboardStore): string {
  const overdue = getOverdueTasks(store.tasks);
  const todayTasks = getTodayTasks(store.tasks);
  const openSlack = store.slackItems.filter((s) => !s.completed);
  const mailNeedsAction = store.mailItems.filter(
    (m) => m.status === "needs_reply" || m.status === "unread"
  );
  const activeReleases = store.releases.filter((r) => r.status !== "live");
  const upcomingTasks = getUpcomingTasks(store.tasks).slice(0, 5);

  const lines: string[] = [
    `User: ${store.profile.name}, ${store.profile.role} at ${store.profile.company}`,
    "",
    `## Overdue tasks (${overdue.length})`,
    ...overdue.map((t) => `- [${t.priority}] ${t.title} (due ${t.dueDate})`),
    "",
    `## Due today (${todayTasks.length})`,
    ...todayTasks.map((t) => `- [${t.priority}] ${t.title}`),
    "",
    `## Open Slack items (${openSlack.length})`,
    ...openSlack.map((s) => `- ${s.channel}: ${s.summary} [${s.action}]`),
    "",
    `## Mail needing action (${mailNeedsAction.length})`,
    ...mailNeedsAction.map((m) => `- ${m.subject}: ${m.summary}`),
    "",
    `## Active releases (${activeReleases.length})`,
    ...activeReleases.map(
      (r) =>
        `- ${r.name} (${r.phase ?? "phase unset"}, ${r.status}, target ${r.targetDate ?? "TBD"})${
          r.blockers.length ? ` — blockers: ${r.blockers.join(", ")}` : ""
        }`
    ),
    "",
    `## Coming up (${upcomingTasks.length})`,
    ...upcomingTasks.map((t) => `- [${t.priority}] ${t.title} (due ${t.dueDate})`),
    "",
    `## Team outings`,
    ...store.outings.map((o) => {
      const spent = getOutingSpent(o);
      const remaining = o.budget - spent;
      const outingMembers = getOutingConfirmedAttendees(o).length;
      const snackMembers = getFollowUpAttendeeCount(o);
      const snackLine =
        snackMembers > 0 ? `, ${snackMembers} for follow-up snacks` : "";
      return `- ${o.title}: budget ${o.budget}, spent ${spent}, ${remaining} remaining, ${outingMembers}/${o.attendees.length} outing members${snackLine}`;
    }),
  ];

  return lines.join("\n");
}

export function summarizeDashboard(store: DashboardStore) {
  const appTasks = getTasksTabTasks(store.tasks);
  return {
    overdueCount: getOverdueTasks(appTasks).length,
    todayCount: getTodayTasks(appTasks).length,
    openTasks: appTasks.filter((t) => t.status !== "done").length,
    openSlack: store.slackItems.filter((s) => !s.completed).length,
    openMail: store.mailItems.filter((m) => m.status !== "done").length,
    mailAction: store.mailItems.filter(
      (m) => m.status === "needs_reply" || m.status === "unread"
    ).length,
    activeReleases: store.releases.filter((r) => r.status !== "live").length,
    upcomingCount: getUpcomingTasks(appTasks).length,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getUpcomingOutings(outings: Outing[]): Outing[] {
  return outings
    .filter((o) => !isOutingPast(o))
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return -1;
      if (!b.date) return 1;
      return parseISO(a.date).getTime() - parseISO(b.date).getTime();
    });
}

export function getOutingSpent(outing: Outing): number {
  if (outing.expenses?.length) {
    return outing.expenses.reduce((sum, e) => sum + e.amount, 0);
  }
  return outing.spent ?? 0;
}

export function getOutingExpensesByType(
  outing: Outing,
  type: Outing["expenses"][number]["type"]
): number {
  return (outing.expenses ?? [])
    .filter(
      (e) =>
        e.type === type ||
        (type === "outing" && (e.type as string) === "event")
    )
    .reduce((sum, e) => sum + e.amount, 0);
}

export function getOutingRemaining(outing: Outing): number {
  return outing.budget - getOutingSpent(outing);
}

export function getOutingConfirmedAttendees(outing: Outing) {
  return outing.attendees.filter((a) => a.confirmed);
}

export function getFollowUpAttendees(outing: Outing) {
  if (outing.followUpAttendees?.length) {
    return outing.followUpAttendees.filter((a) => a.confirmed);
  }
  if (isOutingPast(outing)) {
    return getOutingConfirmedAttendees(outing);
  }
  return [];
}

export function getFollowUpAttendeeCount(outing: Outing): number {
  return getFollowUpAttendees(outing).length;
}

export function getFollowUpBudgetPerPerson(outing: Outing): number | null {
  const count = getFollowUpAttendeeCount(outing);
  if (count === 0) return null;
  const remaining = getOutingRemaining(outing);
  if (remaining <= 0) return null;
  return remaining / count;
}

export function isOutingPast(outing: Outing): boolean {
  if (outing.completed) return true;
  if (!outing.date) return false;
  return isBefore(startOfDay(parseISO(outing.date)), startOfDay(new Date()));
}

export function getOutingSummaryLine(outing: Outing, past: boolean): string {
  if (past) {
    const remaining = getOutingRemaining(outing);
    if (remaining > 0) {
      const kind =
        outing.destination?.toLowerCase().includes("reservoir") ||
        outing.expenses?.some((e) => e.title.toLowerCase().includes("dinner"))
          ? "Dinner"
          : "Team";
      return `${kind} outing · ${formatCurrency(remaining)} leftover available for follow-up snacks.`;
    }
  }

  return outing.notes ?? "";
}

/** Guess resource type from URL hostname/path — user can override in the UI. */
export function detectProjectResourceType(rawUrl: string): ProjectResourceType {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "link";

  let hostname = "";
  let pathname = "";
  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return "link";
  }

  if (hostname === "figma.com" || hostname.endsWith(".figma.com") || hostname === "figma.site") {
    return "figma";
  }

  if (
    hostname === "sheets.google.com" ||
    pathname.startsWith("/spreadsheets")
  ) {
    return "sheets";
  }

  if (
    hostname === "slides.google.com" ||
    pathname.startsWith("/presentation")
  ) {
    return "slides";
  }

  if (
    hostname === "docs.google.com" ||
    hostname === "drive.google.com" ||
    hostname === "notion.so" ||
    hostname.endsWith(".notion.so") ||
    hostname === "notion.site" ||
    hostname.endsWith(".notion.site") ||
    hostname === "coda.io" ||
    hostname.endsWith(".coda.io") ||
    hostname === "paper.dropbox.com" ||
    hostname.includes("sharepoint.") ||
    hostname === "1drv.ms" ||
    (hostname.endsWith(".atlassian.net") && pathname.startsWith("/wiki"))
  ) {
    return "doc";
  }

  return "link";
}
