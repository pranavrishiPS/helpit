export const SLACK_RATE_LIMITED_EVENT = "helpit:slack-rate-limited";
export const SLACK_SYNC_INTERVAL_MS = 10 * 60 * 1000;
export const SLACK_SYNC_HOUR_START = 9;
export const SLACK_SYNC_HOUR_END = 19;

export function notifySlackRateLimited(message: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SLACK_RATE_LIMITED_EVENT, { detail: { message } })
    );
  }
}

/** Sync runs 9:00–18:59 in the browser's local timezone. */
export function isWithinSlackSyncHours(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= SLACK_SYNC_HOUR_START && hour < SLACK_SYNC_HOUR_END;
}

export function getNextSlackSyncAt(
  lastSyncedAt?: string,
  now = new Date()
): Date {
  if (!isWithinSlackSyncHours(now)) {
    const resume = new Date(now);
    resume.setHours(SLACK_SYNC_HOUR_START, 0, 0, 0);
    if (now.getHours() >= SLACK_SYNC_HOUR_END) {
      resume.setDate(resume.getDate() + 1);
    }
    return resume;
  }

  let next = (lastSyncedAt ? new Date(lastSyncedAt).getTime() : now.getTime()) + SLACK_SYNC_INTERVAL_MS;
  while (next <= now.getTime()) {
    next += SLACK_SYNC_INTERVAL_MS;
  }

  const nextDate = new Date(next);
  if (nextDate.getHours() >= SLACK_SYNC_HOUR_END) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(SLACK_SYNC_HOUR_START, 0, 0, 0);
    return tomorrow;
  }

  return nextDate;
}

export function formatSlackSyncCountdown(
  lastSyncedAt: string | undefined,
  now = new Date()
): string {
  if (!isWithinSlackSyncHours(now)) {
    const resume = getNextSlackSyncAt(lastSyncedAt, now);
    return `Resumes ${resume.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  const ms = getNextSlackSyncAt(lastSyncedAt, now).getTime() - now.getTime();
  if (ms <= 0) return "Syncing soon…";

  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `Next sync in ${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export async function handleSlackSyncResponse(
  res: Response
): Promise<{ ok: boolean; rateLimited?: boolean; error?: string }> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    rateLimited?: boolean;
  };

  if (data.rateLimited || res.status === 429) {
    const message =
      data.error ??
      "Slack rate limit reached. Sync will retry in 10 minutes.";
    notifySlackRateLimited(message);
    return { ok: false, rateLimited: true, error: message };
  }

  if (!res.ok) {
    return { ok: false, error: data.error ?? "Sync failed" };
  }

  return { ok: true };
}
