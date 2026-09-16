"use client";

import { useDashboard } from "@/lib/use-dashboard";
import { PageHeader, StatCard, Card, Badge } from "@/components/ui";
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
  getTasksTabTasks,
  getMailTabTasks,
  getReleasePlatform,
  releasePlatformTitleClass,
  formatReleaseDate,
} from "@/lib/utils";
import { RELEASE_PHASE_LABELS, RELEASE_STATUS_LABELS } from "@/lib/release-constants";
import { sortUpcomingReleases } from "@/lib/release-sort";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { ArrowRight, AlertCircle } from "lucide-react";

export function HomeDashboard() {
  const { store, loading, error, updateTask, deleteTask, addTask } = useDashboard();

  if (loading) {
    return <div className="text-sm text-muted">Loading dashboard...</div>;
  }

  if (error || !store) {
    return <div className="text-sm text-warning">{error ?? "Failed to load dashboard"}</div>;
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
  const inFlightReleases = sortUpcomingReleases(
    store.releases.filter((r) => r.status !== "live")
  );
  const greeting = getGreeting();

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${store.profile.name}`}
        description={`${store.profile.role} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}`}
      />

      {stats.overdueCount > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm text-foreground">
            <strong>{stats.overdueCount} overdue</strong> — tackle these first to unblock the team.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Due today" value={stats.todayCount} accent={stats.todayCount > 0} />
        <StatCard label="Open tasks" value={stats.openTasks} />
        <StatCard label="Slack items" value={stats.openSlack} hint="Need follow-up" />
        <StatCard label="Mail items" value={stats.openMail} hint="Need action" />
        <StatCard label="Due soon" value={upcomingCount} hint="Upcoming" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">{overdue.length > 0 ? "Overdue" : "Due today"}</h2>
            <Link href="/tasks" className="flex items-center gap-1 text-xs text-accent hover:underline">
              All tasks <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Coming up</h2>
          </div>
          <TaskList
            tasks={upcoming}
            onUpdate={updateTask}
            onDelete={deleteTask}
            compact
          />
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Slack — open items</h2>
            <Link href="/slack" className="flex items-center gap-1 text-xs text-accent hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="space-y-2">
            {openSlack.length === 0 ? (
              <p className="py-2 text-sm text-muted">No open Slack follow-ups right now.</p>
            ) : (
              openSlack.map((item) => (
                <li key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-accent">{item.channel}</span>
                    <Badge className={priorityColor(item.priority)}>{item.action}</Badge>
                  </div>
                  <p className="mt-1 text-sm">{item.summary}</p>
                  {item.dueDate && (
                    <p className="mt-1 text-xs text-muted">Due {formatDueDate(item.dueDate)}</p>
                  )}
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Mail — needs action</h2>
            <Link href="/mail" className="flex items-center gap-1 text-xs text-accent hover:underline">
              Inbox <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="space-y-2">
            {openMail.length === 0 ? (
              <p className="py-2 text-sm text-muted">
                Connect Gmail to see inbox items here.
              </p>
            ) : (
              openMail.map((item) => (
                <li key={item.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{item.subject}</p>
                  <p className="mt-1 text-xs text-muted">{item.summary}</p>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Releases in flight</h2>
            <Link href="/planning" className="flex items-center gap-1 text-xs text-accent hover:underline">
              Planning <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="space-y-3">
            {inFlightReleases.length === 0 ? (
              <p className="py-2 text-sm text-muted">No releases in flight right now.</p>
            ) : (
              inFlightReleases.map((release) => {
                const platform = getReleasePlatform(release);
                return (
                <li key={release.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm font-medium", releasePlatformTitleClass(platform))}>
                      {release.name}
                    </span>
                    <span className="text-xs text-muted">{formatReleaseDate(release.targetDate, true)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {RELEASE_STATUS_LABELS[release.status]}
                    {release.phase ? ` · ${RELEASE_PHASE_LABELS[release.phase]}` : ""}
                  </p>
                </li>
                );
              })
            )}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Reminders</h2>
            <Link href="/mail" className="flex items-center gap-1 text-xs text-accent hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <TaskList
            tasks={openMailReminders}
            onUpdate={updateTask}
            onDelete={deleteTask}
            compact
          />
        </Card>
      </div>

      {nextOuting && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">{nextOuting.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {getOutingSummaryLine(nextOuting, false) ||
                  `${nextOuting.budgetPerPerson != null ? `${formatCurrency(nextOuting.budgetPerPerson)}/person · ` : ""}${nextOuting.attendees.length} members`}
              </p>
            </div>
            <Link href="/outings">
              <Badge className="cursor-pointer border-accent/30 bg-accent/5 text-accent">
                View outings
              </Badge>
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
