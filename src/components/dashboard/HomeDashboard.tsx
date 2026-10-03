"use client";

import { useDashboard } from "@/lib/use-dashboard";
import {
  StatCard,
  Card,
  CardHeader,
  CardLink,
  Badge,
  ErrorBanner,
  EmptyState,
  ModuleChip,
  PageSkeleton,
  buttonClasses,
} from "@/components/ui";
import { TaskList, AddTaskForm } from "@/components/tasks/TaskList";
import {
  summarizeDashboard,
  getOverdueTasks,
  getTodayTasks,
  getUpcomingTasks,
  formatDueDate,
  priorityColor,
  formatCurrency,
  getUpcomingOutings,
  getOutingSummaryLine,
  getOutingPoolBreakdown,
  getTasksTabTasks,
  getMailTabTasks,
  getReleasePlatform,
  releasePlatformTitleClass,
  releasePlatformDateClass,
  releasePhaseColor,
  formatReleaseDate,
} from "@/lib/utils";
import { RELEASE_PHASE_LABELS, RELEASE_STATUS_LABELS } from "@/lib/release-constants";
import { sortUpcomingReleases } from "@/lib/release-sort";
import { cn } from "@/lib/cn";
import Link from "next/link";
import {
  AlertCircle,
  BellRing,
  CalendarCheck,
  CalendarClock,
  ListTodo,
  Mail,
  MessageSquare,
  Rocket,
} from "lucide-react";

export function HomeDashboard() {
  const { store, loading, error, clearError, updateTask, deleteTask, addTask } = useDashboard();

  if (loading) {
    return <PageSkeleton label="Loading dashboard..." />;
  }

  if (!store) {
    return <ErrorBanner message={error ?? "Failed to load dashboard"} />;
  }

  const stats = summarizeDashboard(store);
  const appTasks = getTasksTabTasks(store.tasks);
  const mailReminders = getMailTabTasks(store.tasks);
  const overdue = getOverdueTasks(appTasks);
  const today = getTodayTasks(appTasks);
  const dueTodayCardTasks = overdue.length > 0 ? overdue : today;
  const upcoming = getUpcomingTasks(appTasks).slice(0, 5);
  const openSlack = store.slackItems.filter((s) => !s.completed).slice(0, 3);
  const openMail = store.mailItems.filter((m) => m.status !== "done").slice(0, 3);
  const openMailReminders = mailReminders.filter((t) => t.status !== "done").slice(0, 4);
  const upcomingCount = getUpcomingTasks(appTasks).length;
  const nextOuting = getUpcomingOutings(store.outings)[0];
  const nextPool = nextOuting ? getOutingPoolBreakdown(nextOuting) : null;
  const inFlightReleases = sortUpcomingReleases(
    store.releases.filter((r) => r.status !== "live")
  );
  const greeting = getGreeting();

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={clearError} />}

      <section className="mb-6 rounded-modal bg-hero p-5 text-white shadow-raised sm:p-7">
        <h1 className="text-balance font-display text-[28px] font-bold leading-[34px] tracking-[-0.02em] sm:text-[34px] sm:leading-10">
          {`${greeting}, ${store.profile.name}`}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {`${store.profile.role} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}`}
        </p>
        {stats.overdueCount > 0 && (
          <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm ring-1 ring-white/25">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              <strong>{stats.overdueCount} overdue</strong> — tackle these first to unblock the team.
            </span>
          </p>
        )}
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        <StatCard
          label="Due today"
          value={stats.todayCount}
          tone={stats.todayCount > 0 ? "attention" : "default"}
          icon={CalendarCheck}
          module="tasks"
          href="/tasks"
        />
        <StatCard label="Open tasks" value={stats.openTasks} icon={ListTodo} module="tasks" href="/tasks" />
        <StatCard
          label="Slack items"
          value={stats.openSlack}
          hint="Need follow-up"
          icon={MessageSquare}
          module="slack"
          href="/slack"
        />
        <StatCard
          label="Mail items"
          value={stats.openMail}
          hint="Need action"
          icon={Mail}
          module="mail"
          href="/mail"
        />
        <StatCard
          label="Due soon"
          value={upcomingCount}
          hint="Upcoming"
          icon={CalendarClock}
          module="tasks"
          href="/tasks"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <Card>
          <CardHeader
            module="tasks"
            icon={overdue.length > 0 ? AlertCircle : CalendarCheck}
            title={
              overdue.length > 0 ? (
                <>
                  Overdue <span className="tabular-nums text-danger">{overdue.length}</span>
                </>
              ) : (
                "Due today"
              )
            }
            action={<CardLink href="/tasks">All tasks</CardLink>}
          />
          <TaskList
            tasks={dueTodayCardTasks}
            onUpdate={updateTask}
            onDelete={deleteTask}
            compact
          />
          <div
            className={
              dueTodayCardTasks.length === 0 ? "mt-3 flex justify-center" : "mt-3"
            }
          >
            <AddTaskForm onAdd={addTask} />
          </div>
        </Card>

        <Card>
          <CardHeader module="tasks" icon={CalendarClock} title="Coming up" />
          <TaskList
            tasks={upcoming}
            onUpdate={updateTask}
            onDelete={deleteTask}
            compact
          />
        </Card>

        <Card>
          <CardHeader
            module="slack"
            title="Slack — open items"
            action={<CardLink href="/slack">View all</CardLink>}
          />
          {openSlack.length === 0 ? (
            <EmptyState compact icon={MessageSquare} title="No open Slack follow-ups right now." />
          ) : (
            <ul className="space-y-2">
              {openSlack.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl bg-surface-2/70 p-3 transition-colors hover:bg-surface-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">{item.channel}</span>
                    <Badge className={priorityColor(item.priority)}>{item.action}</Badge>
                  </div>
                  <p className="mt-1 break-words text-sm">{item.summary}</p>
                  {item.dueDate && (
                    <p className="mt-1 text-xs text-muted">Due {formatDueDate(item.dueDate)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            module="mail"
            title="Mail — needs action"
            action={<CardLink href="/mail">Inbox</CardLink>}
          />
          {openMail.length === 0 ? (
            <EmptyState compact icon={Mail} title="Connect Gmail to see inbox items here." />
          ) : (
            <ul className="space-y-2">
              {openMail.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl bg-surface-2/70 p-3 transition-colors hover:bg-surface-2"
                >
                  <p className="break-words text-sm font-medium">{item.subject}</p>
                  <p className="mt-1 text-xs text-muted">{item.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            module="planning"
            icon={Rocket}
            title="Releases in flight"
            action={<CardLink href="/planning">Planning</CardLink>}
          />
          {inFlightReleases.length === 0 ? (
            <EmptyState compact icon={Rocket} title="No releases in flight right now." />
          ) : (
            <ul className="divide-y divide-border">
              {inFlightReleases.map((release) => {
                const platform = getReleasePlatform(release);
                return (
                  <li key={release.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            platform === "android" && "bg-android",
                            platform === "ios" && "bg-ios",
                            !platform && "bg-subtle"
                          )}
                        />
                        <span
                          className={cn(
                            "truncate text-sm font-semibold",
                            releasePlatformTitleClass(platform)
                          )}
                        >
                          {release.name}
                        </span>
                      </span>
                      <span className={cn("shrink-0", releasePlatformDateClass(platform))}>
                        {formatReleaseDate(release.targetDate, true)}
                      </span>
                    </div>
                    <div className="mt-1.5 pl-4">
                      <Badge className={releasePhaseColor(release.phase)}>
                        {RELEASE_STATUS_LABELS[release.status]}
                        {release.phase ? ` · ${RELEASE_PHASE_LABELS[release.phase]}` : ""}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            module="mail"
            icon={BellRing}
            title="Reminders"
            action={<CardLink href="/mail">View all</CardLink>}
          />
          <TaskList
            tasks={openMailReminders}
            onUpdate={updateTask}
            onDelete={deleteTask}
            compact
          />
        </Card>
      </div>

      {nextOuting && (
        <Card className="mt-6 bg-[linear-gradient(135deg,var(--pop-soft),var(--card)_60%)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <ModuleChip module="outings" size="md" />
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold leading-[22px]">
                  {nextOuting.title}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {getOutingSummaryLine(nextOuting, false) ||
                    `${formatCurrency(nextOuting.budget)} team pool · ${nextPool?.going} of ${nextPool?.teamSize} going`}
                </p>
              </div>
            </div>
            <Link
              href="/outings"
              className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "self-start sm:self-auto")}
            >
              View outings
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
